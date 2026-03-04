import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        console.warn('⚠️  .env file not found. Using example.');
        return {};
    }
    
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            env[key] = value;
        }
    });
    
    return env;
}

const env = loadEnv();

// Minimum credits to keep unused on each account (safety buffer)
const MIN_REMAINING_CREDITS = parseFloat(env.CLOUDINARY_MIN_REMAINING_CREDITS ?? '0.5');

// Multi-account Cloudinary configuration
export const cloudinaryAccounts = [];

// Parse accounts from env
let accountIndex = 1;
while (env[`CLOUDINARY_CLOUD_NAME_${accountIndex}`]) {
    const account = {
        cloudName: env[`CLOUDINARY_CLOUD_NAME_${accountIndex}`],
        apiKey: env[`CLOUDINARY_API_KEY_${accountIndex}`],
        apiSecret: env[`CLOUDINARY_API_SECRET_${accountIndex}`],
        uploadCount: 0,        // Track upload count for round-robin
        storageUsed: 0,        // Track storage usage (optional)
        remainingCredits: null,
        lastUsageCheck: 0,
        disabled: false        // Permanently skipped when credits are too low
    };
    
    if (account.cloudName && account.apiKey && account.apiSecret) {
        cloudinaryAccounts.push(account);
    }
    
    accountIndex++;
}

if (cloudinaryAccounts.length === 0) {
    console.warn('⚠️  No Cloudinary accounts configured. Image backup will be disabled.');
}

console.log(`✅ Loaded ${cloudinaryAccounts.length} Cloudinary account(s)`);

// Sequential pointer: use one account until exhausted, then move to next (no round-robin)
let currentAccountIndex = 0;

// Fetch account usage/credits from Cloudinary API
async function refreshAccountUsage(account) {
    try {
        const url = `https://api.cloudinary.com/v1_1/${account.cloudName}/usage`;
        const response = await axios.get(url, {
            auth: {
                username: account.apiKey,
                password: account.apiSecret
            },
            timeout: 10000
        });
        
        const credits = response.data?.credits;
        if (credits) {
            const limit = typeof credits.limit === 'number' ? credits.limit : null;
            // Some responses use `usage`, some emphasize `credits_usage`, prefer the more detailed if present
            const rawUsage = typeof credits.usage === 'number' ? credits.usage : null;
            const detailedUsage = typeof credits.credits_usage === 'number' ? credits.credits_usage : null;
            const used = detailedUsage ?? rawUsage ?? 0;
            
            if (limit !== null) {
                account.remainingCredits = limit - used;
                const usedPercent = limit > 0 ? (used / limit) * 100 : 0;
                console.log(
                    `🔍 Cloudinary account ${account.cloudName} usage: used=${used.toFixed(2)}/${limit} (${usedPercent.toFixed(2)}%), remaining=${account.remainingCredits.toFixed(2)}`
                );
            }
        }
        
        account.lastUsageCheck = Date.now();
    } catch (err) {
        console.error(`⚠️  Failed to fetch usage for Cloudinary account ${account.cloudName}:`, err.message);
        // On failure, do not block uploads – keep previous remainingCredits value
    }
}

// Select account sequentially: use current account until it has no credits left, then switch to next
export async function getUploadAccount() {
    if (cloudinaryAccounts.length === 0) return null;
    
    for (let i = 0; i < cloudinaryAccounts.length; i++) {
        const index = (currentAccountIndex + i) % cloudinaryAccounts.length;
        const account = cloudinaryAccounts[index];
        
        if (account.disabled) continue;
        
        // Refresh usage at most once every 5 minutes per account
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (!account.lastUsageCheck || now - account.lastUsageCheck > FIVE_MINUTES) {
            await refreshAccountUsage(account);
        }
        
        // If we do not have usage info, optimistically allow uploads
        if (account.remainingCredits == null) {
            account.uploadCount++;
            currentAccountIndex = index;
            return account;
        }
        
        // Use this account only if it still has more than MIN_REMAINING_CREDITS
        if (account.remainingCredits > MIN_REMAINING_CREDITS) {
            account.uploadCount++;
            currentAccountIndex = index;
            return account;
        }
        
        // Exhausted: disable and try next account
        account.disabled = true;
        console.warn(
            `⚠️  Cloudinary account ${account.cloudName} is low on credits (${account.remainingCredits?.toFixed(2)}), switching to next account.`
        );
        currentAccountIndex = (index + 1) % cloudinaryAccounts.length;
    }
    
    console.error('⛔ No Cloudinary account has enough remaining credits for upload.');
    return null;
}

// Get account by cloud name (for reference)
export function getAccountByCloudName(cloudName) {
    return cloudinaryAccounts.find(acc => acc.cloudName === cloudName);
}
