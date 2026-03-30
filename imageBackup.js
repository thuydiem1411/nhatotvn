import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { getUploadAccount } from './cloudinaryConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Temp folder for image processing
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Feature flag: control whether videos are included in backup
const BACKUP_VIDEOS = (process.env.BACKUP_VIDEOS ?? 'true').toLowerCase() === 'true';

// Extract filename from URL (for storing shortened src in imgs_bak)
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

// Shorten Cloudinary URL to relative path (remove domain + cloudName + /image/upload/)
function shortenCloudinaryUrl(url, cloudName) {
    if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return url;
    
    // Pattern: https://res.cloudinary.com/{cloudName}/image/upload/{path}
    // Extract: {path}
    const pattern = new RegExp(`https://res\\.cloudinary\\.com/${cloudName}/image/upload/(.+)$`);
    const match = url.match(pattern);
    return match ? match[1] : url;
}

// Generate Cloudinary signature for authenticated upload
function generateSignature(params, apiSecret) {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
    
    return crypto
        .createHash('sha1')  // Cloudinary uses SHA-1, not SHA-256!
        .update(sortedParams + apiSecret)
        .digest('hex');
}

// Download and resize image/video to single optimized file
async function downloadAndOptimize(url) {
    try {
        // Validate URL
        if (!url || !url.startsWith('http')) {
            console.error(`  ❌ Invalid URL format: ${url}`);
            return null;
        }
        
        // Check if video
        const isVideo = url.match(/\.(mp4|webm|mov|avi)$/i) || url.includes('video');
        
        if (isVideo) {
            // For video: just return URL (no processing without ffmpeg)
            return {
                url: url,
                type: 'video',
                needsUpload: false
            };
        }
        
        // Download image
        // console.log(`    Downloading: ${url.substring(0, 80)}...`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const imageBuffer = Buffer.from(response.data);
        
        // Single optimized image (no crop, max compression)
        const optimized = await sharp(imageBuffer)
            .resize(600, 600, {
                fit: 'inside',              // Giữ tỷ lệ, không crop
                withoutEnlargement: true    // Không phóng to
            })
            .webp({ 
                quality: 50,                // Giảm quality xuống 50% để tối ưu
                effort: 6                   // Max compression effort
            })
            .toBuffer();
        
        return {
            buffer: optimized,
            type: 'image',
            needsUpload: true,
            originalSize: imageBuffer.length,
            optimizedSize: optimized.length,
            compressionRatio: ((1 - optimized.length / imageBuffer.length) * 100).toFixed(1)
        };
        
    } catch (error) {
        // console.error(`❌ Download/optimize failed for ${url}:`, error.message);
        return null;
    }
}

// Upload buffer to Cloudinary (single optimized file)
async function uploadBufferToCloudinary(imageBuffer, adId, filename) {
    const account = await getUploadAccount();
    
    try {
        if (!account) {
            throw new Error('No Cloudinary account available');
        }
        
        const base64Image = imageBuffer.toString('base64');
        const dataUri = `data:image/webp;base64,${base64Image}`;
        
        // Upload parameters
        const timestamp = Math.floor(Date.now() / 1000);
        const publicId = `chotot/${adId}/${filename}`;
        
        // Parameters to sign (MUST be sorted alphabetically!)
        const paramsToSign = {
            public_id: publicId,
            timestamp: timestamp
        };
        
        const signature = generateSignature(paramsToSign, account.apiSecret);
        
        // Create form data
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append('file', dataUri);
        formData.append('api_key', account.apiKey);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);
        formData.append('public_id', publicId);
        
        // Upload to Cloudinary
        const uploadUrl = `https://api.cloudinary.com/v1_1/${account.cloudName}/image/upload`;
        
        const response = await axios.post(uploadUrl, formData, {
            headers: formData.getHeaders(),
            timeout: 60000
        });
        
        return {
            cloudName: account.cloudName,
            publicId: response.data.public_id,
            url: response.data.secure_url,
            bytes: response.data.bytes
        };
        
    } catch (error) {
        const errorData = error.response?.data || {};
        const errorMessage = errorData.error?.message || error.message;
        
        console.error(`❌ Upload failed:`, errorMessage);
        if (account) {
            console.error(`   Cloud: ${account.cloudName}`);
        }
        
        // Return error info to detect rate limit
        return {
            error: true,
            isRateLimit: errorMessage.toLowerCase().includes('rate limit') || 
                        errorMessage.toLowerCase().includes('too many requests') ||
                        error.response?.status === 429,
            message: errorMessage
        };
    }
}

// Backup all images for an ad (1 file per image, with metadata)
export async function backupAdImages(ad) {
    // Only backup personal ads
    if (ad.company_ad === true) {
        return { success: false, reason: 'Skip company ads' };
    }
    
    // Get existing successful backups (filter: only 'ok' is truly backed up)
    const existingBackups = ad.imgs_bak || [];
    const successfulBackupSrcs = new Set(
        existingBackups
            .filter(img => img.s === 'ok') // Only count 'ok' as backed up
            .map(img => img.src)
    );
    
    // Get all images/videos (videos are optional via env flag)
    const allMedia = [
        ...(ad.images || []),
        ...(BACKUP_VIDEOS ? (ad.videos || []) : [])
    ];
    
    if (allMedia.length === 0) {
        return { success: false, reason: 'No media' };
    }
    
    // Filter: only backup media NOT already successful
    const mediaNeedBackup = allMedia.filter(url => {
        const filename = extractFilename(url);
        return filename && !successfulBackupSrcs.has(filename); // Also filter empty filenames
    });
    
    if (mediaNeedBackup.length === 0) {
        console.log(`  ⏭️  Skip ad ${ad.ad_id}: All media already backed up (${successfulBackupSrcs.size} successful, ${allMedia.length} media)`);
        return { success: false, reason: 'All media already backed up successfully' };
    }
    
    console.log(`\n📸 Backing up ${mediaNeedBackup.length}/${allMedia.length} media for ad ${ad.ad_id}`);
    
    const backupResults = [];
    let successCount = 0;
    
    for (const mediaUrl of mediaNeedBackup) {
        try {
            // Validate URL
            if (!mediaUrl || typeof mediaUrl !== 'string' || mediaUrl.trim() === '') {
                // console.log(`  ⚠️  Invalid URL: ${mediaUrl}`);
                backupResults.push({
                    src: extractFilename(mediaUrl),  // Store only filename
                    bak: null,
                    c: null,
                    s: 'error'
                });
                continue;
            }
            
            // Optimize media (only try ONCE)
            const optimized = await downloadAndOptimize(mediaUrl.trim());
            
            if (!optimized) {
                // Failed to download/optimize - mark as fail and continue
                backupResults.push({
                    src: extractFilename(mediaUrl),  // Store only filename
                    bak: null,
                    c: null,
                    s: 'fail'
                });
                // console.log(`  ❌ Download failed: ${mediaUrl}`);
                continue;
            }
            
            // If video, just save URL
            if (!optimized.needsUpload) {
                backupResults.push({
                    src: extractFilename(mediaUrl),  // Store only filename
                    bak: optimized.url,
                    c: null,
                    s: 'ok'
                });
                successCount++;
                console.log(`  ✓ Video: ${optimized.url}`);
                continue;
            }
            
            // Upload single optimized image
            // console.log(`  ✓ Optimized: ${optimized.originalSize}B → ${optimized.optimizedSize}B (${optimized.compressionRatio}% saved)`);
            
            const filename = crypto.randomBytes(8).toString('hex');
            const uploadResult = await uploadBufferToCloudinary(optimized.buffer, ad.ad_id, filename);
            
            if (uploadResult && !uploadResult.error) {
                backupResults.push({
                    src: extractFilename(mediaUrl),  // Store only filename, not full URL
                    bak: shortenCloudinaryUrl(uploadResult.url, uploadResult.cloudName),  // Store relative path only
                    c: uploadResult.cloudName,
                    s: 'ok'
                });
                successCount++;
                console.log(`  ✅ ${uploadResult.url} (${uploadResult.cloudName})`);
            } else {
                backupResults.push({
                    src: extractFilename(mediaUrl),  // Store only filename
                    bak: null,
                    c: null,
                    s: uploadResult?.isRateLimit ? 'rate_limit' : 'fail'
                });
                // console.log(`  ❌ Upload failed: ${mediaUrl}`);
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            backupResults.push({
                src: extractFilename(mediaUrl),  // Store only filename
                bak: null,
                c: null,
                s: 'error'
            });
            // console.error(`  ❌ Error: ${error.message}`);
        }
    }
    
    // Merge: keep existing successful backups + new results
    const finalResults = [
        ...existingBackups.filter(img => img.s === 'ok'), // Keep successful
        ...backupResults // Add new attempts
    ];
    
    return {
        success: successCount > 0,
        backed_up: successCount,
        total: mediaNeedBackup.length,
        results: finalResults  // Array of objects with metadata (old 'ok' + new attempts)
    };
}

// Batch backup ads from file (for manual batch processing)
export async function batchBackupAdsFromFile(filePath) {
    try {
        console.log(`\n📦 Starting batch backup: ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.error('❌ File not found');
            return;
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const ads = Array.isArray(data) ? data : [];
        
        console.log(`📊 Total ads: ${ads.length}`);
        
        // Filter personal ads without backup
        const adsToBackup = ads.filter(ad => 
            ad.company_ad !== true && 
            (!ad.imgs_bak || ad.imgs_bak.length === 0) &&
            ((ad.images && ad.images.length > 0) || (ad.videos && ad.videos.length > 0))
        );
        
        console.log(`📋 To backup: ${adsToBackup.length}`);
        
        let processedCount = 0;
        let successCount = 0;
        
        for (const ad of adsToBackup) {
            processedCount++;
            console.log(`\n[${processedCount}/${adsToBackup.length}] Ad: ${ad.ad_id}`);
            
            const result = await backupAdImages(ad);
            
            if (result.success) {
                // Save array of URLs
                ad.imgs_bak = result.results;  // ["url1", "url2", ...]
                successCount++;
            }
            
            // Save progress every 10 ads
            if (processedCount % 10 === 0) {
                fs.writeFileSync(filePath, JSON.stringify(ads), 'utf-8');
                console.log(`💾 Saved: ${processedCount}/${adsToBackup.length}`);
            }
        }
        
        // Final save (minified)
        fs.writeFileSync(filePath, JSON.stringify(ads), 'utf-8');
        
        console.log(`\n✅ Completed!`);
        console.log(`   Processed: ${processedCount}`);
        console.log(`   Success: ${successCount}`);
        console.log(`   Failed: ${processedCount - successCount}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
    const fileArg = process.argv[2];
    
    if (!fileArg) {
        console.log('Usage: node imageBackup.js <path-to-ads-json>');
        console.log('Example: node imageBackup.js public-chotot/data/ads-13096.json');
        process.exit(1);
    }
    
    const filePath = path.resolve(process.cwd(), fileArg);
    await batchBackupAdsFromFile(filePath);
}
