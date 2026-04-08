import 'dotenv/config';
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import crypto from "crypto";
import { backupAdImages } from "./imageBackup.js";
import { resetCloudinaryAccountsState } from "./cloudinaryConfig.js";
import * as chototMysql from "./db/chototMysql.js";

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
const PHONE_FALLBACK_THEIA =
    (process.env.PHONE_FALLBACK_THEIA ?? 'true').toLowerCase() === 'true';
const PUSHMORE_WEBHOOK_URL = process.env.PUSHMORE_WEBHOOK_URL || '';

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

// Check if ad needs image backup: every image filename must have been attempted once (any status).
// Do not clear failed entries here; only recovery clears non-ok so re-crawled ads can retry.
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
    
    // All imgs_bak entries count as "attempted" (ok / fail / rate_limit / error — no retry for dead URLs)
    const attemptedSrcs = new Set(
        (ad.imgs_bak || [])
            .map(img => (typeof img?.src === 'string' ? img.src : ''))
            .filter(f => f.length > 0)
    );
    
    // Extract filenames from all media URLs (filter out invalid)
    const mediaFilenames = allMedia
        .map(url => extractFilename(url))
        .filter(f => f && f.length > 0);
    
    // If no valid filenames → skip (cannot verify)
    if (mediaFilenames.length === 0) {
        return false;
    }
    
    const allAttempted = mediaFilenames.every(filename => attemptedSrcs.has(filename));
    
    if (!allAttempted) {
        const missing = mediaFilenames.filter(f => !attemptedSrcs.has(f)).length;
        console.log(`   📊 Coverage check for ad ${ad.ad_id}: ${missing} images not attempted yet (imgs_bak=${ad.imgs_bak.length}, media=${allMedia.length})`);
        return true;
    }
    
    // Every filename has an imgs_bak row (even if fail) → skip
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
            return { phone: response.data.phone, hiddenExpired: false, ok: true };
        }
        return { phone: null, hiddenExpired: false, ok: false };
    } catch (err) {
        const status = err?.response?.status ?? err?.status;
        if (status === 429) {
            countGetPhoneFailed++;
        }
        if (status === 404 && err?.response?.data?.message?.includes(listId)) {
            return { phone: null, hiddenExpired: true, ok: false };
        }
        console.error(`❌ Lỗi lấy phone cho list_id ${listId}:`, err?.message || err);
        return { phone: null, hiddenExpired: false, ok: false };
    }
}

function normalizePhoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function isCallablePhone(value) {
    const digits = normalizePhoneDigits(value);
    return digits.length >= 8;
}

function hasPlaceholderPhoneText(value) {
    if (value == null) return false;
    const s = String(value).trim();
    if (!s) return false;
    return !isCallablePhone(s);
}

async function fetchTheiaListIds(accountOid) {
    const out = [];
    let page = 1;
    let totalPage = 1;
    while (page <= totalPage) {
        const url = `https://gateway.chotot.com/v1/public/theia/${accountOid}?limit=100&page=${page}`;
        const resp = await axios.get(url, { timeout: 20000 });
        const data = resp?.data || {};
        const ads = Array.isArray(data.ads) ? data.ads : [];
        for (const a of ads) {
            const listId = Number(a?.info?.list_id ?? a?.list_id);
            if (Number.isFinite(listId) && listId > 0) out.push(listId);
        }
        totalPage = Number(data?.paging?.totalPage || 1);
        page += 1;
        await new Promise((r) => setTimeout(r, 120));
    }
    return [...new Set(out)];
}

async function fetchPhonesByAccountOid(accountOid) {
    if (!accountOid) return { phones: [], sourceListIds: [] };
    const listIds = await fetchTheiaListIds(accountOid);
    // Always skip list_ids already saved successfully as source_ad_id.
    const ids = await chototMysql.getSellerPhoneSourceAdIds(accountOid);
    const knownSource = new Set(ids.map((n) => Number(n)));
    const entries = [];
    for (const listId of listIds) {
        if (knownSource.has(Number(listId))) continue;
        const r = await getPhoneNumber(listId);
        if (r?.phone) {
            entries.push({ phone: r.phone, source_ad_id: listId });
        }
        await new Promise((res) => setTimeout(res, 160));
    }
    if (entries.length) {
        await chototMysql.upsertSellerPhones(accountOid, entries);
    }
    return {
        phones: entries.map((e) => e.phone),
        sourceListIds: listIds
    };
}

async function safeWriteFile(data, areaId, category) {
    // This function is now MySQL-only for crawl persistence.
    try {
        await chototMysql.upsertListingsForCrawl(
            parseInt(String(areaId), 10),
            parseInt(String(category), 10),
            data
        );
        return true;
    } catch (err) {
        console.error("❌ Lỗi ghi MySQL:", err?.message || err);
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

function ruleMatchesAd(rule, ad, areaId, category) {
    const adArea = Number(ad?.area_v2 ?? areaId);
    const adWard = Number(ad?.ward);
    const adCategory = String(ad?.category ?? category ?? '');
    const adPrice = ad?.price != null ? Number(ad.price) : null;
    const adCompany = ad?.company_ad === true;
    const haystack = `${ad?.subject || ''}\n${ad?.body || ''}`.toLowerCase();

    if (Array.isArray(rule?.areas) && rule.areas.length > 0 && !rule.areas.includes(adArea)) return false;
    if (Array.isArray(rule?.wards) && rule.wards.length > 0 && !rule.wards.includes(adWard)) return false;
    if (Array.isArray(rule?.categories) && rule.categories.length > 0 && !rule.categories.includes(adCategory)) return false;
    if (rule?.price_min != null && Number.isFinite(Number(rule.price_min)) && !(adPrice != null && adPrice >= Number(rule.price_min))) return false;
    if (rule?.price_max != null && Number.isFinite(Number(rule.price_max)) && !(adPrice != null && adPrice <= Number(rule.price_max))) return false;
    if (rule?.company_mode === 'personal' && adCompany) return false;
    if (rule?.company_mode === 'agent' && !adCompany) return false;
    if (rule?.keyword && !haystack.includes(String(rule.keyword).toLowerCase())) return false;
    return true;
}

async function sendPushmoreAlert(message) {
    if (!PUSHMORE_WEBHOOK_URL) return false;
    try {
        await axios.post(PUSHMORE_WEBHOOK_URL, String(message), {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            timeout: 15000
        });
        return true;
    } catch (err) {
        console.error("❌ Pushmore alert failed:", err?.message || err);
        return false;
    }
}

async function pushAreaAlertsOnce(newAds, areaId, category) {
    if (!newAds.length) return;
    const rules = await chototMysql.getEnabledAlertRules();
    if (!rules.length) return;
    for (const rule of rules) {
        const matched = newAds.filter((ad) => ruleMatchesAd(rule, ad, areaId, category));
        if (!matched.length) continue;
        const top = matched.slice(0, 20);
        const lines = top.map((ad) => {
            const url = `https://tim-tro.nport.link/?ad_id=${encodeURIComponent(String(ad.ad_id || ""))}`;
            return `#${ad.ad_id} | ${ad.price_string || ad.price || "N/A"} | ${ad.subject || ""}\n${url}`;
        });
        const msg =
            `[ALERT] ${rule.name}\n` +
            `area=${areaId} category=${category} matched=${matched.length}\n` +
            `${lines.join("\n")}`;
        await sendPushmoreAlert(msg);
    }
}

async function mergeByAdId(newAds, areaId, category, freshAdsCollector = null) {
    // This function is now MySQL-only for existing crawl data.
    let existingAds = [];
    try {
        const ids = [
            ...new Set(
                newAds
                    .map((a) => Number(a.ad_id))
                    .filter((n) => Number.isFinite(n) && n > 0)
            )
        ];
        existingAds = ids.length
            ? await chototMysql.getListingsByAdIds(ids)
            : [];
        if (!Array.isArray(existingAds)) existingAds = [];
    } catch (err) {
        console.error(`❌ Lỗi đọc dữ liệu ads-${areaId}-${CATEGORY_NAMES[category]}:`, err?.message || err);
        existingAds = [];
    }

    const map = new Map(existingAds.map(ad => [ad.ad_id, ad]));

    for (const ad of newAds) {
        // Clean data before processing (remove redundant fields to save storage)
        cleanAdData(ad);

        const existing = map.get(ad.ad_id) || {};
        if (!existing?.ad_id) {
            if (Array.isArray(freshAdsCollector)) {
                freshAdsCollector.push(ad);
            }
        }
        const merged = mergeNonNull(existing, ad);

        // Keep existing listing.phone when crawl payload does not include phone.
        // Phone should only change when we actually fetch a new phone value.

        // Add category info to ad
        merged.category = category;
        merged.category_name = CATEGORY_DISPLAY_NAMES[category];
        // Keep original guards (company_ad, phone_hidden, list_id, rate-limit),
        // then only fetch for:
        // 1) new ads without phone, or
        // 2) existing ads whose stored DB phone is missing or placeholder text (not callable digits).
        const hasExisting = Boolean(existing?.ad_id);
        const shouldRefreshExistingPhone = hasExisting && (!existing?.phone || hasPlaceholderPhoneText(existing?.phone));
        const shouldFetchNewAd = !hasExisting && !merged.phone;
        const shouldTryFetchPhone =
            !merged.company_ad &&
            !merged.phone_hidden &&
            merged.list_id &&
            countGetPhoneFailed < 3 &&
            (shouldFetchNewAd || shouldRefreshExistingPhone);
        if (shouldTryFetchPhone) {
            const phoneResult = await getPhoneNumber(merged.list_id);
            if (phoneResult?.phone) {
                merged.phone = phoneResult.phone;
                if (merged.account_oid) {
                    try {
                        await chototMysql.upsertSellerPhones(merged.account_oid, [
                            { phone: phoneResult.phone, source_ad_id: merged.ad_id }
                        ]);
                    } catch (e) {
                        console.error(`❌ Lỗi lưu seller phone cho account_oid ${merged.account_oid}:`, e?.message || e);
                    }
                }
                console.log(
                    `✅ Đã lấy phone: ${phoneResult.phone} cho ad_id ${merged.ad_id}, area ${areaId}, category ${category}`
                );
            }

            const shouldFallback =
                PHONE_FALLBACK_THEIA &&
                merged.account_oid &&
                (!phoneResult?.phone || !isCallablePhone(phoneResult.phone));
            if (shouldFallback) {
                try {
                    const extra = await fetchPhonesByAccountOid(merged.account_oid);
                    if (extra.phones.length > 0) {
                        merged.phone = extra.phones[0];
                        console.log(
                            `✅ Fallback theia lấy được ${extra.phones.length} phone cho account_oid ${merged.account_oid}`
                        );
                    } else {
                        console.log(
                            `❌ Không lấy được phone (kể cả theia) cho ad_id ${merged.ad_id}, account_oid ${merged.account_oid}`
                        );
                    }
                } catch (e) {
                    console.error(
                        `❌ Lỗi fallback theia cho account_oid ${merged.account_oid}:`,
                        e?.message || e
                    );
                }
            } else if (!phoneResult?.phone) {
                console.log(`❌ Không lấy được phone cho ad_id ${merged.ad_id}, area ${areaId}, category ${category}`);
            }
            // Delay nhẹ giữa các request phone để tránh bị block
            await new Promise(resolve => setTimeout(resolve, 500));
        } else if (countGetPhoneFailed >= 3) {
            await sendPushmoreAlert(`❌ Bị rate limit khi lấy phone cho ad_id ${merged.ad_id}, area ${areaId}, category ${category}`);
        }

        map.set(ad.ad_id, merged);
    }

    return Array.from(map.values());
}

// Backup images for ads in a single area
async function backupAdsInArea(adsNeedBackup, adsData, areaId, category) {
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
                await chototMysql.saveListingPayload(ad);
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
                    await chototMysql.saveListingPayload(ad);
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
    const queryParams = {
        ...PARAMS,
        cg: category, // Use category param
        page: page.toString(),
        o: offset.toString()
    };
    // Keep house crawl capped at <= 5,000,000.
    if (category === "1020") {
        queryParams.price = "0-5000000";
    }
    const url = `${BASE_URL}?${new URLSearchParams({
        ...queryParams
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
                // Reset per area+category: only stop this category on 3 consecutive 429.
                countGetPhoneFailed = 0;
                console.log(`\n📦 Crawling area ${currentArea}, category ${currentCategory} (${CATEGORY_DISPLAY_NAMES[currentCategory]})...`);
                const freshAdsForArea = [];
                
                // Fetch first page to get total
                const firstPage = await fetchPage(1, currentCategory);
                const total = firstPage.total || 0;
                const limit = parseInt(PARAMS.limit);
                const totalPages = Math.ceil(total / limit);
                
                console.log(`📊 Total: ${total} ads, ${totalPages} pages`);
                
                let allAds = [...(firstPage.ads || [])];
                
                // Save page 1 immediately
                const merged1 = await mergeByAdId(allAds, currentArea, currentCategory, freshAdsForArea);
                if (await safeWriteFile(merged1, currentArea, currentCategory)) {
                    console.log(`💾 Page 1: ${firstPage.ads?.length || 0} ads, saved => ${merged1.length} total`);
                }
                
                // Crawl remaining pages
                for (let page = 2; page <= totalPages; page++) {
                    try {
                        const pageData = await fetchPage(page, currentCategory);
                        if (pageData.ads && pageData.ads.length > 0) {
                            allAds = [...allAds, ...pageData.ads];
                            
                            // Save after each page
                            const merged = await mergeByAdId(allAds, currentArea, currentCategory, freshAdsForArea);
                            if (await safeWriteFile(merged, currentArea, currentCategory)) {
                                console.log(`💾 Page ${page}: ${pageData.ads.length} ads, saved => ${merged.length} total`);
                            }
                        }
                        // Delay between requests
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (err) {
                        console.error(`❌ Error page ${page}:`, err?.message || err);
                    }
                }
                
                try {
                    await pushAreaAlertsOnce(freshAdsForArea, currentArea, currentCategory);
                } catch (err) {
                    console.error("❌ Area alert push failed:", err?.message || err);
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
                
                let adsData;
                adsData = await chototMysql.loadAssembledListingsByAreaCategory(
                    parseInt(String(currentArea), 10),
                    parseInt(String(currentCategory), 10)
                );
                if (!adsData.length) {
                    console.log(`⏭️  No listings in DB for area ${currentArea}, category ${currentCategory}, skipping`);
                    continue;
                }
                
                // Filter ads need backup using new needsBackup logic
                const adsNeedBackup = adsData.filter(ad => needsBackup(ad));
                
                console.log(`📋 Area ${currentArea}, category ${currentCategory}: ${adsNeedBackup.length} ads need backup`);
                
                // Threshold check
                if (adsNeedBackup.length < 10) {
                    // Small batch: backup now, continue to next area
                    if (adsNeedBackup.length > 0) {
                        console.log(`🔹 Small batch (< 10), backing up...`);
                        await backupAdsInArea(adsNeedBackup, adsData, currentArea, currentCategory);
                    } else {
                        console.log(`✓ No backup needed`);
                    }
                    continue; // Next area
                } else {
                    // Large batch: backup now, then BREAK
                    console.log(`🔸 Large batch (>= 10), backing up then returning to crawl...`);
                    await backupAdsInArea(adsNeedBackup, adsData, currentArea, currentCategory);
                    
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
        // Reset account runtime flags so each run starts fresh.
        resetCloudinaryAccountsState();
        if (!chototMysql.isEnabled()) {
            throw new Error("MySQL must be enabled. JSON runtime mode has been removed.");
        }
        ensureDataDir();
        await chototMysql.ensureSchema();
        
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


