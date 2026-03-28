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
    // CRITICAL: This function ONLY reads/writes BACKUP files
    // It NEVER touches -nobackup files
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

    const map = new Map(existingAds.map(ad => [ad.ad_id, ad]));

    for (const ad of newAds) {
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

    return Array.from(map.values());
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

async function fetchAllPages() {
    if (isRunning) {
        return;
    }

    isRunning = true;

    try {
        // Chọn area hiện tại và cập nhật tham số
        const currentArea = areaOrder[areaIndex % areaOrder.length];
        PARAMS.area_v2 = currentArea;
        ensureDataDir();

        console.log(`\n🔄 Bắt đầu crawl area ${currentArea} (index ${areaIndex})`);

        // Loop through all categories
        for (const currentCategory of CATEGORIES) {
            try {
                console.log(`\n📦 Crawling category ${currentCategory} (${CATEGORY_DISPLAY_NAMES[currentCategory]})...`);

                // Lấy page 1 để biết total
                const firstPage = await fetchPage(1, currentCategory);
                const total = firstPage.total || 0;
                const limit = parseInt(PARAMS.limit);
                const totalPages = Math.ceil(total / limit);

                console.log(`📊 Total: ${total} ads, ${totalPages} pages`);

                let allAds = [...(firstPage.ads || [])];

                // Save page 1 ngay - mergeByAdId sẽ tự đọc file mới nhất
                const merged1 = await mergeByAdId(allAds, currentArea, currentCategory);
                if (safeWriteFile(merged1, currentArea, currentCategory)) {
                    console.log(`💾 Page 1: ${firstPage.ads?.length || 0} ads, saved => ${merged1.length} total`);
                }

                // Crawl từ page 2 đến hết, save sau mỗi page
                for (let page = 2; page <= totalPages; page++) {
                    try {
                        const pageData = await fetchPage(page, currentCategory);
                        if (pageData.ads && pageData.ads.length > 0) {
                            allAds = [...allAds, ...pageData.ads];

                            // Save sau mỗi page - mergeByAdId sẽ tự đọc file mới nhất
                            const merged = await mergeByAdId(allAds, currentArea, currentCategory);
                            if (safeWriteFile(merged, currentArea, currentCategory)) {
                                console.log(`💾 Page ${page}: ${pageData.ads.length} ads, saved => ${merged.length} total`);
                            }
                        }
                        // Delay nhẹ giữa các request
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (err) {
                        console.error(`❌ Lỗi page ${page}:`, err?.message || err);
                    }
                }

                console.log(`✅ Category ${currentCategory}: Hoàn thành crawl ${totalPages} pages, tổng ${allAds.length} ads`);
                
                // ====== IMAGE BACKUP LOGIC ======
                // After crawl done, backup images for personal ads
                console.log(`\n📸 Starting image backup for area ${currentArea}, category ${currentCategory}...`);
                
                try {
                    const areaFile = getAreaFile(currentArea, currentCategory);
                    const adsData = JSON.parse(fs.readFileSync(areaFile, 'utf-8'));
                    let backedUpCount = 0;
                    
                    // Filter personal ads without backup
                    const adsNeedBackup = adsData.filter(ad => {
                        // Must be personal ad
                        if (ad.company_ad === true) return false;
                        
                        // Must have media
                        if (!ad.images?.length && !ad.videos?.length) return false;
                        
                        // Need backup if no imgs_bak
                        if (!ad.imgs_bak || ad.imgs_bak.length === 0) return true;
                        
                        // Already has backup data - skip it
                        return false;
                    });
                    
                    if (adsNeedBackup.length > 0) {
                        console.log(`📋 Found ${adsNeedBackup.length} ads need backup - Starting full backup...`);
                        
                        let consecutiveRateLimitFails = 0;
                        const RATE_LIMIT_THRESHOLD = 3; // Skip area after 3 consecutive rate limit fails
                        
                        // Backup ALL ads in this area (no limit)
                        for (let i = 0; i < adsNeedBackup.length; i++) {
                            const ad = adsNeedBackup[i];
                            console.log(`\n[${i + 1}/${adsNeedBackup.length}] Processing ad ${ad.ad_id}...`);
                            
                            // Check if hit rate limit threshold
                            if (consecutiveRateLimitFails >= RATE_LIMIT_THRESHOLD) {
                                console.warn(`\n⚠️  Rate limit detected (${consecutiveRateLimitFails} consecutive fails)`);
                                console.warn(`⏭️  Skipping remaining ads in ${currentArea}, will retry in next cycle`);
                                break;
                            }
                            
                            try {
                                const result = await backupAdImages(ad);
                                
                                if (result.success) {
                                    ad.imgs_bak = result.results;
                                    backedUpCount++;
                                    consecutiveRateLimitFails = 0; // Reset counter on success
                                    
                                    // Save after each ad to prevent data loss
                                    fs.writeFileSync(areaFile, JSON.stringify(adsData), 'utf-8');
                                } else {
                                    // Check if any media hit rate limit
                                    const hasRateLimit = result.results?.some(r => r.s === 'rate_limit');
                                    if (hasRateLimit) {
                                        consecutiveRateLimitFails++;
                                        console.warn(`  ⚠️  Rate limit counter: ${consecutiveRateLimitFails}/${RATE_LIMIT_THRESHOLD}`);
                                    } else {
                                        consecutiveRateLimitFails = 0; // Reset if not rate limit
                                    }
                                    
                                    // Save results even if not all succeeded
                                    if (result.results && result.results.length > 0) {
                                        ad.imgs_bak = result.results;
                                        fs.writeFileSync(areaFile, JSON.stringify(adsData), 'utf-8');
                                    }
                                }
                            } catch (err) {
                                console.error(`  ❌ Backup failed for ad ${ad.ad_id}:`, err.message);
                                consecutiveRateLimitFails = 0; // Reset on other errors
                            }
                        }
                        
                        console.log(`\n✅ Backup completed: ${backedUpCount}/${adsNeedBackup.length} ads in ${currentArea}, category ${currentCategory}`);
                    } else {
                        console.log(`✓ All ads already backed up in area ${currentArea}, category ${currentCategory}`);
                    }
                } catch (backupErr) {
                    console.error(`❌ Backup error for area ${currentArea}, category ${currentCategory}:`, backupErr.message);
                }
                // ====== END IMAGE BACKUP ======

            } catch (categoryErr) {
                console.error(`❌ Lỗi crawl category ${currentCategory}:`, categoryErr?.message || categoryErr);
            }
        }

        console.log(`\n🎉 Hoàn thành toàn bộ area ${currentArea}, areaIndex ${areaIndex}`);
        
        // Tăng index để lần cron tiếp theo chuyển sang khu vực kế tiếp
        areaIndex = (areaIndex + 1) % areaOrder.length;
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


