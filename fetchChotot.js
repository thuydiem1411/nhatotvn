import 'dotenv/config';
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import crypto from "crypto";
import { backupAdImages } from "./imageBackup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://gateway.chotot.com/v1/public/ad-listing";

// Category configuration
const CATEGORIES = ["1050", "1020"]; // Trọ, Nhà ở
const CATEGORY_NAMES = {
    '1050': 'tro',
    '1020': 'nha'
};
const CATEGORY_DISPLAY_NAMES = {
    '1050': 'Trọ',
    '1020': 'Nhà ở'
};

// Crawl cycle strategy (from ENV)
// true  -> BACKUP first, then CRAWL
// false -> CRAWL first, then BACKUP (default)
const BACKUP_FIRST = (process.env.BACKUP_FIRST ?? 'false').toLowerCase() === 'true';

// Thứ tự area cần crawl luân phiên
const areaOrder = [
    "13110",
    "13107",
    "13112",
    "13111",
    "13109",
    "13119",
    "13096",
    "13098",
    "13099",
    "13100",
    "13101",
    "13102",
    "13103",
    "13105",
    "13106",
    "13108",
    "13113",
    "13115",
    "13120",
    "13116",
    "13117",
    "13118"
];
let areaIndex = 0;
const PARAMS = {
    region_v2: "13000",
    area_v2: "13110",
    cg: "1050", // Will be updated per category
    limit: "50",
    // f: "p",
    include_expired_ads: "true"
};

const dataDir = path.join(__dirname, "public-chotot/data");
// Không cần dataFile nữa, sẽ lưu theo từng area

// Clean ad data by removing redundant image fields (save storage)
function cleanAdData(ad) {
    delete ad.image;
    delete ad.webp_image;
    delete ad.thumbnail_image;
    delete ad.image_thumbnails;
    delete ad.special_display_images;
    return ad;
}

// Extract filename from URL (used to match imgs_bak with images)
function extractFilename(url) {
    if (!url || typeof url !== 'string') return '';
    // Handle video dict with metadata
    if (typeof url === 'object') {
        const videoUrl = url.thumbnail || url.url || url.gif_url || '';
        const match = videoUrl.match(/([^/]+\.(jpg|jpeg|png|webp|gif|m3u8))$/i);
        return match ? match[1] : `video_${url.id || 'unknown'}`;
    }
    // Extract filename from URL string
    const match = url.match(/([^/]+\.(jpg|jpeg|png|webp|gif))$/i);
    return match ? match[1] : '';
}

// Check if ad needs image backup (filename coverage check)
function needsBackup(ad) {
    // Must be personal ad
    if (ad.company_ad === true) return false;
    
    // Must have media
    const images = ad.images || [];
    const videos = ad.videos || [];
    const allMedia = [...images, ...videos];
    if (allMedia.length === 0) return false;
    
    // No imgs_bak → needs backup
    if (!ad.imgs_bak || ad.imgs_bak.length === 0) return true;
    
    // Filter imgs_bak: only count successful backups ('ok' only)
    const successfulBackups = ad.imgs_bak.filter(img => img.s === 'ok');
    
    // Has imgs_bak but no success → clear and retry
    if (successfulBackups.length === 0) {
        console.log(`   🔄 Clearing ${ad.imgs_bak.length} failed imgs_bak for ad ${ad.ad_id}`);
        ad.imgs_bak = [];
        return true;
    }
    
    // ALWAYS check filename coverage (no quick length check)
    // Build set of backed-up filenames
    const backedUpSrcs = new Set(successfulBackups.map(img => img.src));
    
    // Extract filenames from all media URLs (filter out invalid)
    const mediaFilenames = allMedia
        .map(url => extractFilename(url))
        .filter(f => f && f.length > 0); // Remove invalid filenames
    
    // If no valid filenames → skip (cannot verify)
    if (mediaFilenames.length === 0) {
        return false;
    }
    
    // Check if ALL valid filenames are covered
    const allCovered = mediaFilenames.every(filename => backedUpSrcs.has(filename));
    
    if (!allCovered) {
        const missing = mediaFilenames.filter(f => !backedUpSrcs.has(f)).length;
        console.log(`   📊 Coverage check for ad ${ad.ad_id}: ${missing} images not backed up (imgs_bak=${successfulBackups.length}, media=${allMedia.length})`);
        return true;
    }
    
    // All images covered → skip (even if imgs_bak dư)
    return false;
}

// RSA Public Key để mã hóa list_id
const RSAPublicKey = {
    production: `-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAxnvPjlA/K/adq6mA6+uU\ntlyBBxFaKeK+WD2FypOeCAP0qtucmaDrIbxirykrxQjRpGxl2HKRBwGd2h/hDuk9\nCxRUXD2p0Hrzb1Hb9M5px19TPXM6AWSClR1kozehRusIFrxP6PHqDLx5prJFLlSZ\nzg3N3oGhS6oP/a4Ku/iAdCUCiHb5TX3b3+y4Ll/QViZhpKZjU6BhIOsiVIJhyXvn\n0cSqLXPjNuXR5A4JkmRl9T9cWncEHTKmoVUyXQJaDZa3yH/OJSEmhhGyKNKkM5so\nlasJWSBKenFnFvphw3+KG8BGfJwGkvtRAVbS1ljduH8z8fxALxHgUdnTtgpxB+KZ\n/CVnNr97EGqYPLVlX+duGkuy1yCunqVTiY2HyL/0bMTBK84oCQjtMVAHgZ345hZn\nmGST71D8+i5HGtOOFoRyP6qK6ex1qfEROzWsmVDA00aHLlQcKOLaHvT/DB30aeUs\nZoL/kQo100XccufpHESrits0mEuoyza4CCFM04F3pDOXAgMBAAE=\n-----END PUBLIC KEY-----`
};

let isRunning = false;

function ensureDataDir() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

// Get backup file path with category
// IMPORTANT: This function ONLY returns backup file path
// It NEVER creates or writes to -nobackup files
// Backup files are always updated by crawler (regardless of imgs_bak status)
function getAreaFile(areaId, category) {
    const categoryName = CATEGORY_NAMES[category] || 'unknown';
    return path.join(dataDir, `ads-${areaId}-${categoryName}.json`);
}

// Load nobackup file for recovery check (READ ONLY - never write to this file from crawler)
function loadNobackupFile(areaId, category) {
    const categoryName = CATEGORY_NAMES[category] || 'unknown';
    const nobackupFile = path.join(dataDir, `ads-${areaId}-${categoryName}-nobackup.json`);
    
    if (!fs.existsSync(nobackupFile)) return [];
    
    try {
        const content = fs.readFileSync(nobackupFile, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Error reading nobackup file:`, err.message);
        return [];
    }
}

// Save nobackup file after recovery (remove recovered ads)
function saveNobackupFile(data, areaId, category) {
    const categoryName = CATEGORY_NAMES[category] || 'unknown';
    const nobackupFile = path.join(dataDir, `ads-${areaId}-${categoryName}-nobackup.json`);
    const tempFile = nobackupFile + '.tmp';
    
    try {
        // Write to temp file first
        fs.writeFileSync(tempFile, JSON.stringify(data), 'utf-8');
        // Atomic rename
        fs.renameSync(tempFile, nobackupFile);
        return true;
    } catch (err) {
        console.error(`Error saving nobackup file:`, err.message);
        // Cleanup temp file
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}
        return false;
    }
}



function encryptToE(h) {
    const key = RSAPublicKey.production;
    const cipherB64 = crypto.publicEncrypt(
        { key, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(String(h), "utf8")
    ).toString("base64");
    return encodeURIComponent(cipherB64);
}

async function getPhoneNumber(listId) {
    try {
        const e = encryptToE(listId);
        const url = `https://gateway.chotot.com/v1/public/ad-listing/phone?e=${e}`;
        const response = await axios.get(url, { timeout: 15000 });

        if (response && response?.data && response?.data?.phone) {
            countGetPhoneFailed = 0;
            return response.data.phone;
        }
        return null;
    } catch (err) {
        if (err.status == 429) {
            countGetPhoneFailed++;
        }
        if (err?.status == 404 && err?.response?.data?.message?.includes(listId)) {
            return "Số bị ẩn do hết hạn";
        }
        console.error(`❌ Lỗi lấy phone cho list_id ${listId}:`, err?.message || err);
        return null;
    }
}

async function safeWriteFile(data, areaId, category) {
    // CRITICAL: This function ONLY writes to BACKUP files
    // Path format: ads-{areaId}-{tro|nha}.json
    // NEVER writes to -nobackup files (those are read-only, created once by Python script)
    const areaFile = getAreaFile(areaId, category); // e.g., ads-13096-tro.json
    const tempFile = areaFile + '.tmp';
    const backupFile = areaFile + '.backup';
    
    try {
        // Step 1: Write to temp file
        fs.writeFileSync(tempFile, JSON.stringify(data), "utf-8");
        
        // Step 2: If original file exists, create backup copy
        if (fs.existsSync(areaFile)) {
            try {
                fs.copyFileSync(areaFile, backupFile);
            } catch (copyErr) {
                console.error("⚠️  Không thể tạo backup, nhưng tiếp tục:", copyErr?.message);
            }
        }
        
        // Step 3: Rename temp to main (atomic operation on most systems)
        fs.renameSync(tempFile, areaFile);
        
        // Step 4: Delete backup after successful rename
        if (fs.existsSync(backupFile)) {
            try {
                fs.unlinkSync(backupFile);
            } catch (unlinkErr) {
                console.warn("⚠️  Không thể xóa backup file (sẽ xóa lần sau):", unlinkErr?.message);
            }
        }
        
        return true;
        
    } catch (err) {
        console.error("❌ Lỗi ghi file:", err?.message || err);
        
        // Recovery: restore from backup if exists and original file is corrupted/missing
        if (fs.existsSync(backupFile)) {
            try {
                // Check if original file is missing or corrupted
                let needRestore = false;
                if (!fs.existsSync(areaFile)) {
                    needRestore = true;
                    console.log("🔄 File gốc bị mất, đang restore từ backup...");
                } else {
                    // Try to parse original file to check if corrupted
                    try {
                        const content = fs.readFileSync(areaFile, "utf-8");
                        JSON.parse(content);
                    } catch (parseErr) {
                        needRestore = true;
                        console.log("🔄 File gốc bị corrupt, đang restore từ backup...");
                    }
                }
                
                if (needRestore) {
                    fs.copyFileSync(backupFile, areaFile);
                    console.log("✅ Đã restore từ backup thành công");
                }
            } catch (restoreErr) {
                console.error("❌ Lỗi restore từ backup:", restoreErr?.message);
            }
        }
        
        // Cleanup temp files
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            // Keep backup file if restore was attempted
            // Otherwise delete it
            if (fs.existsSync(backupFile) && fs.existsSync(areaFile)) {
                fs.unlinkSync(backupFile);
            }
        } catch (cleanupErr) {
            console.warn("⚠️  Lỗi cleanup files:", cleanupErr?.message);
        }
        
        return false;
    }
}

function mergeNonNull(oldObj, newObj) {
    const result = { ...oldObj };
    for (const [key, value] of Object.entries(newObj || {})) {
        if (value !== null && value !== undefined) {
            if (Array.isArray(value)) {
                result[key] = value;
            } else if (typeof value === 'object') {
                result[key] = mergeNonNull(oldObj?.[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
    }
    return result;
}

let countGetPhoneFailed = 0;

async function mergeByAdId(newAds, areaId, category) {
    // CRITICAL: This function saves ALL crawled ads to BACKUP files
    // It checks nobackup to track recovery, but NEVER writes to nobackup
    // Đọc lại file ads-{areaId}-{category}.json mới nhất mỗi lần merge
    let existingAds = [];
    try {
        const areaFile = getAreaFile(areaId, category); // Backup file only
        if (fs.existsSync(areaFile)) {
            const fileContent = fs.readFileSync(areaFile, "utf-8");
            existingAds = JSON.parse(fileContent);
            if (!Array.isArray(existingAds)) {
                existingAds = [];
            }
        }
    } catch (err) {
        console.error(`❌ Lỗi đọc file ads-${areaId}-${CATEGORY_NAMES[category]}.json:`, err?.message || err);
        existingAds = [];
    }

    // Load nobackup file to check for recovery
    const nobackupAds = loadNobackupFile(areaId, category);
    const nobackupSet = new Set(nobackupAds.map(ad => ad.ad_id));
    const recoveredIds = new Set(); // Track recovered ad_ids

    const map = new Map(existingAds.map(ad => [ad.ad_id, ad]));

    for (const ad of newAds) {
        // Clean data before processing (remove redundant fields to save storage)
        cleanAdData(ad);

        // Check if this ad is being recovered from nobackup
        if (nobackupSet.has(ad.ad_id)) {
            console.log(`🔄 Recovery detected: ad ${ad.ad_id} (was in nobackup, now re-crawled)`);
            recoveredIds.add(ad.ad_id);
            
            // Clear only failed imgs_bak, keep successful ones
            const existing = map.get(ad.ad_id);
            if (existing?.imgs_bak && existing.imgs_bak.length > 0) {
                const before = existing.imgs_bak.length;
                const successBackups = existing.imgs_bak.filter(img => img.s === 'ok');
                const removed = before - successBackups.length;
                
                if (removed > 0) {
                    console.log(`   Removing ${removed} failed imgs_bak, keeping ${successBackups.length} successful`);
                    existing.imgs_bak = successBackups;
                } else {
                    console.log(`   All ${before} imgs_bak are successful, keeping all`);
                }
            }
        }

        const existing = map.get(ad.ad_id) || {};
        const merged = mergeNonNull(existing, ad);

        // Add category info to ad
        merged.category = category;
        merged.category_name = CATEGORY_DISPLAY_NAMES[category];

        // // Kiểm tra và lấy phone nếu cần
        // !merged.company_ad
        if (!merged.phone && !merged.company_ad && !merged.phone_hidden && merged.list_id && countGetPhoneFailed < 3) {
            const phone = await getPhoneNumber(merged.list_id);
            if (phone) {
                merged.phone = phone;
                console.log(`✅ Đã lấy phone: ${phone} cho ad_id ${merged.ad_id}, area ${areaId}, category ${category}`);
            } else {
                console.log(`❌ Không lấy được phone cho ad_id ${merged.ad_id}, area ${areaId}, category ${category}`);
            }
            // Delay nhẹ giữa các request phone để tránh bị block
            await new Promise(resolve => setTimeout(resolve, 500));
        } else if (countGetPhoneFailed >= 3) {
            // Gửi webhook bất đồng bộ và không chờ kết quả để tránh ngắt terminal
            // fetch("https://pushmore.io/webhook/uYssJKQjzGF5D1W1ZmZPctvK", {
            //     method: "POST",
            //     headers: { "Content-Type": "application/x-www-form-urlencoded" },
            //     body: `${merged.ad_id} | ${merged.phone}`
            // })
            // .then(() => {
            //     // console.log(`✅ Webhook sent for ad_id ${merged.ad_id}, area ${areaId}`);
            // })
            // .catch((err) => {
            //     // console.error(`❌ Lỗi gửi webhook cho ad_id ${merged.ad_id}:`, err?.message || err);
            //     // Không throw error để tránh ngắt terminal
            // });
        }

        map.set(ad.ad_id, merged);
    }

    // Remove recovered ads from nobackup file
    if (recoveredIds.size > 0) {
        const updatedNobackup = nobackupAds.filter(ad => !recoveredIds.has(ad.ad_id));
        if (saveNobackupFile(updatedNobackup, areaId, category)) {
            console.log(`✅ Removed ${recoveredIds.size} recovered ads from nobackup`);
        }
    }

    return Array.from(map.values());
}

// Backup images for ads in a single area
async function backupAdsInArea(adsNeedBackup, areaFile, adsData, areaId, category) {
    let backedUpCount = 0;
    let consecutiveRateLimitFails = 0;
    const RATE_LIMIT_THRESHOLD = 3;
    
    for (let i = 0; i < adsNeedBackup.length; i++) {
        const ad = adsNeedBackup[i];
        console.log(`\n[${i + 1}/${adsNeedBackup.length}] Processing ad ${ad.ad_id}...`);
        
        // Check if hit rate limit threshold
        if (consecutiveRateLimitFails >= RATE_LIMIT_THRESHOLD) {
            console.warn(`\n⚠️  Rate limit detected (${consecutiveRateLimitFails} consecutive fails)`);
            console.warn(`⏭️  Skipping remaining ads in ${areaId}, will retry in next cycle`);
            break;
        }
        
        try {
            const result = await backupAdImages(ad);
            
            if (result.success) {
                ad.imgs_bak = result.results;
                backedUpCount++;
                consecutiveRateLimitFails = 0;
                
                // Save after each ad to prevent data loss
                fs.writeFileSync(areaFile, JSON.stringify(adsData), 'utf-8');
            } else {
                // Check if any media hit rate limit
                const hasRateLimit = result.results?.some(r => r.s === 'rate_limit');
                if (hasRateLimit) {
                    consecutiveRateLimitFails++;
                    console.warn(`  ⚠️  Rate limit counter: ${consecutiveRateLimitFails}/${RATE_LIMIT_THRESHOLD}`);
                } else {
                    consecutiveRateLimitFails = 0;
                }
                
                // Save results even if not all succeeded
                if (result.results && result.results.length > 0) {
                    ad.imgs_bak = result.results;
                    fs.writeFileSync(areaFile, JSON.stringify(adsData), 'utf-8');
                }
            }
        } catch (err) {
            console.error(`  ❌ Backup failed for ad ${ad.ad_id}:`, err.message);
            consecutiveRateLimitFails = 0;
        }
    }
    
    console.log(`✅ Backed up ${backedUpCount}/${adsNeedBackup.length} ads in area ${areaId}, category ${category}`);
    return backedUpCount;
}

async function fetchPage(page, category) {
    const limit = parseInt(PARAMS.limit);
    const offset = (page - 1) * limit;
    const url = `${BASE_URL}?${new URLSearchParams({
        ...PARAMS,
        cg: category, // Use category param
        page: page.toString(),
        o: offset.toString()
    })}`;
    const res = await axios.get(url, { timeout: 20000 });
    return res.data;
}

// PHASE 1: Crawl all areas (without backup)
async function crawlAllAreas() {
    console.log('\n🔄 CRAWL PHASE: Starting...');
    
    for (const currentArea of areaOrder) {
        PARAMS.area_v2 = currentArea;
        
        for (const currentCategory of CATEGORIES) {
            try {
                console.log(`\n📦 Crawling area ${currentArea}, category ${currentCategory} (${CATEGORY_DISPLAY_NAMES[currentCategory]})...`);
                
                // Fetch first page to get total
                const firstPage = await fetchPage(1, currentCategory);
                const total = firstPage.total || 0;
                const limit = parseInt(PARAMS.limit);
                const totalPages = Math.ceil(total / limit);
                
                console.log(`📊 Total: ${total} ads, ${totalPages} pages`);
                
                let allAds = [...(firstPage.ads || [])];
                
                // Save page 1 immediately
                const merged1 = await mergeByAdId(allAds, currentArea, currentCategory);
                if (safeWriteFile(merged1, currentArea, currentCategory)) {
                    console.log(`💾 Page 1: ${firstPage.ads?.length || 0} ads, saved => ${merged1.length} total`);
                }
                
                // Crawl remaining pages
                for (let page = 2; page <= totalPages; page++) {
                    try {
                        const pageData = await fetchPage(page, currentCategory);
                        if (pageData.ads && pageData.ads.length > 0) {
                            allAds = [...allAds, ...pageData.ads];
                            
                            // Save after each page
                            const merged = await mergeByAdId(allAds, currentArea, currentCategory);
                            if (safeWriteFile(merged, currentArea, currentCategory)) {
                                console.log(`💾 Page ${page}: ${pageData.ads.length} ads, saved => ${merged.length} total`);
                            }
                        }
                        // Delay between requests
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (err) {
                        console.error(`❌ Error page ${page}:`, err?.message || err);
                    }
                }
                
                console.log(`✅ Crawled ${allAds.length} ads for area ${currentArea}, category ${currentCategory}`);
                
            } catch (categoryErr) {
                console.error(`❌ Error crawl category ${currentCategory}:`, categoryErr?.message || categoryErr);
            }
        }
    }
    
    console.log('\n✅ CRAWL PHASE: Complete!');
}

// PHASE 2: Backup images with batch threshold
async function backupAllAreas() {
    console.log('\n📸 BACKUP PHASE: Starting...');
    
    for (const currentArea of areaOrder) {
        for (const currentCategory of CATEGORIES) {
            try {
                console.log(`\n📸 Checking backup for area ${currentArea}, category ${currentCategory}...`);
                
                const areaFile = getAreaFile(currentArea, currentCategory);
                if (!fs.existsSync(areaFile)) {
                    console.log(`⏭️  File not found, skipping`);
                    continue;
                }
                
                const adsData = JSON.parse(fs.readFileSync(areaFile, 'utf-8'));
                
                // Filter ads need backup using new needsBackup logic
                const adsNeedBackup = adsData.filter(ad => needsBackup(ad));
                
                console.log(`📋 Area ${currentArea}, category ${currentCategory}: ${adsNeedBackup.length} ads need backup`);
                
                // Threshold check
                if (adsNeedBackup.length < 10) {
                    // Small batch: backup now, continue to next area
                    if (adsNeedBackup.length > 0) {
                        console.log(`🔹 Small batch (< 10), backing up...`);
                        await backupAdsInArea(adsNeedBackup, areaFile, adsData, currentArea, currentCategory);
                    } else {
                        console.log(`✓ No backup needed`);
                    }
                    continue; // Next area
                } else {
                    // Large batch: backup now, then BREAK
                    console.log(`🔸 Large batch (>= 10), backing up then returning to crawl...`);
                    await backupAdsInArea(adsNeedBackup, areaFile, adsData, currentArea, currentCategory);
                    
                    // BREAK out of backup phase, return to crawl
                    console.log('⏸️  BACKUP PHASE: Paused (will resume after next crawl)');
                    return; // Exit backup phase
                }
                
            } catch (areaErr) {
                console.error(`❌ Backup error for area ${currentArea}, category ${currentCategory}:`, areaErr.message);
            }
        }
    }
    
    console.log('\n✅ BACKUP PHASE: Complete (all areas < 10)!');
}

async function fetchAllPages() {
    if (isRunning) {
        return;
    }

    isRunning = true;

    try {
        ensureDataDir();
        
        // Execute phases based on BACKUP_FIRST env
        if (BACKUP_FIRST) {
            // Strategy 1: BACKUP first, then CRAWL
            await backupAllAreas();
            await crawlAllAreas();
        } else {
            // Strategy 2: CRAWL first, then BACKUP (default)
            await crawlAllAreas();
            await backupAllAreas();
        }
        
        console.log(`\n🎉 Hoàn thành chu kỳ crawl + backup!`);
        countGetPhoneFailed = 0;

    } catch (err) {
        console.error("❌ Lỗi fetch Chợ Tốt:", err?.message || err);
    } finally {
        isRunning = false;
    }
}

// Cron job được khởi tạo trong initCronJob()
// cron.schedule("* * * * * *", async () => {
//     await fetchAllPages();
// });

// Cleanup khi process exit
process.on('SIGINT', () => {
    console.log('\n🛑 Nhận signal SIGINT, cleanup...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Nhận signal SIGTERM, cleanup...');
    process.exit(0);
});

// (async () => {
//     console.log("🚀 Bắt đầu crawl Chợ Tốt...");
//     await fetchAllPages();
// })();

// Function để khởi tạo cron job (không chạy crawl ngay)
function initCronJob() {
    console.log("⏰ Khởi tạo cron job crawl Chợ Tốt...");
    // Cron job sẽ tự động chạy mỗi giây
    cron.schedule("59 * * * * *", async () => {
        await fetchAllPages();
    });
}

export default initCronJob;


