import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://gateway.chotot.com/v1/public/ad-listing";
// Thứ tự area cần crawl luân phiên
const areaOrder = [
    "13110",
    "13107",
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
    "13109",
    "13111",
    "13112",
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
    cg: "1050",
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

function getAreaFile(areaId) {
    return path.join(dataDir, `ads-${areaId}.json`);
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

async function safeWriteFile(data, areaId) {
    try {
        const areaFile = getAreaFile(areaId);
        // Tạo file tạm trước
        const tempFile = areaFile + '.tmp';
        // Lưu dạng minified để giảm kích thước file
        fs.writeFileSync(tempFile, JSON.stringify(data), "utf-8");

        // Đổi tên file tạm thành file chính (atomic operation)
        fs.renameSync(tempFile, areaFile);
        return true;
    } catch (err) {
        console.error("❌ Lỗi ghi file:", err?.message || err);
        // Xóa file tạm nếu có
        try {
            const areaFile = getAreaFile(areaId);
            if (fs.existsSync(areaFile + '.tmp')) {
                fs.unlinkSync(areaFile + '.tmp');
            }
        } catch { }
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

async function mergeByAdId(newAds, areaId) {
    // Đọc lại file ads-{areaId}.json mới nhất mỗi lần merge
    let existingAds = [];
    try {
        const areaFile = getAreaFile(areaId);
        if (fs.existsSync(areaFile)) {
            const fileContent = fs.readFileSync(areaFile, "utf-8");
            existingAds = JSON.parse(fileContent);
            if (!Array.isArray(existingAds)) {
                existingAds = [];
            }
        }
    } catch (err) {
        console.error(`❌ Lỗi đọc file ads-${areaId}.json:`, err?.message || err);
        existingAds = [];
    }

    const map = new Map(existingAds.map(ad => [ad.ad_id, ad]));

    for (const ad of newAds) {
        const existing = map.get(ad.ad_id) || {};
        const merged = mergeNonNull(existing, ad);

        // // Kiểm tra và lấy phone nếu cần
        if (!merged.phone && !merged.company_ad && !merged.phone_hidden && merged.list_id && countGetPhoneFailed < 3) {
            console.log(`📞 Đang lấy phone cho ad_id ${merged.ad_id} (list_id: ${merged.list_id})...`);
            const phone = await getPhoneNumber(merged.list_id);
            if (phone) {
                merged.phone = phone;
                console.log(`✅ Đã lấy phone: ${phone} cho ad_id ${merged.ad_id}`);
            } else {
                console.log(`❌ Không lấy được phone cho ad_id ${merged.ad_id}`);
            }
            // Delay nhẹ giữa các request phone để tránh bị block
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (countGetPhoneFailed >= 3) {
            // Gửi webhook bất đồng bộ và không chờ kết quả để tránh ngắt terminal
            fetch("https://pushmore.io/webhook/uYssJKQjzGF5D1W1ZmZPctvK", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `${merged.ad_id} | ${merged.phone}`
            })
            .then(() => {
                console.log(`✅ Webhook sent for ad_id ${merged.ad_id}`);
            })
            .catch((err) => {
                console.error(`❌ Lỗi gửi webhook cho ad_id ${merged.ad_id}:`, err?.message || err);
                // Không throw error để tránh ngắt terminal
            });
        }

        map.set(ad.ad_id, merged);
    }

    return Array.from(map.values());
}

async function fetchPage(page) {
    const limit = parseInt(PARAMS.limit);
    const offset = (page - 1) * limit;
    const url = `${BASE_URL}?${new URLSearchParams({
        ...PARAMS,
        page: page.toString(),
        o: offset.toString()
    })}`;
    console.log(url);
    const res = await axios.get(url, { timeout: 20000 });
    return res.data;
}

async function fetchAllPages() {
    if (isRunning) {
        console.log("⏸️ Bỏ qua crawl - cron job trước chưa xong");
        return;
    }



    isRunning = true;

    try {
        // Chọn area hiện tại và cập nhật tham số
        const currentArea = areaOrder[areaIndex % areaOrder.length];
        PARAMS.area_v2 = currentArea;
        console.log(`🌐 Crawl khu vực area_v2=${currentArea} (index ${areaIndex % areaOrder.length})`);
        ensureDataDir();

        // Lấy page 1 để biết total
        const firstPage = await fetchPage(1);
        const total = firstPage.total || 0;
        const limit = parseInt(PARAMS.limit);
        const totalPages = Math.ceil(total / limit);

        console.log(`📊 Tổng: ${total} ads, ${totalPages} pages, limit: ${limit}`);

        let allAds = [...(firstPage.ads || [])];

        // Save page 1 ngay - mergeByAdId sẽ tự đọc file mới nhất
        const merged1 = await mergeByAdId(allAds, currentArea);
        if (safeWriteFile(merged1, currentArea)) {
            console.log(`💾 Page 1: ${firstPage.ads?.length || 0} ads, saved => ${merged1.length} total`);
        }

        // Crawl từ page 2 đến hết, save sau mỗi page
        for (let page = 2; page <= totalPages; page++) {
            try {
                const pageData = await fetchPage(page);
                if (pageData.ads && pageData.ads.length > 0) {
                    allAds = [...allAds, ...pageData.ads];

                    // Save sau mỗi page - mergeByAdId sẽ tự đọc file mới nhất
                    const merged = await mergeByAdId(allAds, currentArea);
                    if (safeWriteFile(merged, currentArea)) {
                        console.log(`💾 Page ${page}: ${pageData.ads.length} ads, saved => ${merged.length} total`);
                    }
                }
                // Delay nhẹ giữa các request
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (err) {
                console.error(`❌ Lỗi page ${page}:`, err?.message || err);
            }
        }

        console.log(`✅ Chotot: Hoàn thành crawl ${totalPages} pages, tổng ${allAds.length} ads`);
        // Tăng index để lần cron tiếp theo chuyển sang khu vực kế tiếp
        areaIndex = (areaIndex + 1) % areaOrder.length;
        countGetPhoneFailed = 0;

    } catch (err) {
        console.error("❌ Lỗi fetch Chợ Tốt:", err?.message || err);
    } finally {
        isRunning = false;
    }
}

cron.schedule("*/10 * * * * *", async () => {
    await fetchAllPages();
});

// Cleanup khi process exit
process.on('SIGINT', () => {
    console.log('\n🛑 Nhận signal SIGINT, cleanup...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Nhận signal SIGTERM, cleanup...');
    process.exit(0);
});

(async () => {
    console.log("🚀 Bắt đầu crawl Chợ Tốt...");
    await fetchAllPages();
})();

export default () => { };


