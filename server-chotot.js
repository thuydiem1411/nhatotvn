import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import fetchChotot from "./fetchChotot.js";
import cron from "node-cron";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static("public-chotot"));

// Định nghĩa dataDir ở scope global
const dataDir = path.join(__dirname, "public-chotot/data");

// Cấu hình multer cho upload file
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 100 * 1024 * 10240, // 100MB
        files: 1
    }
});

app.get("/upload", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Chợ Tốt Server</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .container { max-width: 800px; margin: 0 auto; }
                .section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
                .btn { padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }
                .btn:hover { background: #0056b3; }
                .form-group { margin: 15px 0; }
                input[type="file"] { margin: 10px 0; }
                .api-section { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
                code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🏠 Chợ Tốt Server</h1>
                
                <div class="section">
                    <h2>📁 Upload/Download Ads Data</h2>
                    
                    <h3>Upload ads.json</h3>
                    <form action="/upload-ads" method="post" enctype="multipart/form-data">
                        <div class="form-group">
                            <input type="file" name="adsFile" accept="application/json" required />
                        </div>
                        <button type="submit" class="btn">Upload ads.json</button>
                    </form>
                    
                    <h3>Download ads.json</h3>
                    <a href="/download-ads" class="btn">Download ads.json</a>
                </div>
                
                <div class="section">
                    <h2>📞 Phone API</h2>
                    <div class="api-section">
                        <h4>Lấy số điện thoại từ list_id:</h4>
                        <code>GET /api/demo-phone?h=&lt;list_id&gt;&env=production&auth=0</code>
                        <br><br>
                        <strong>Ví dụ:</strong>
                        <br>
                        <code>GET /api/demo-phone?h=127122198&env=production&auth=0</code>
                    </div>
                </div>
                
                <div class="section">
                    <h2>📊 Sample Data</h2>
                    <a href="/api/sample-ad" class="btn">Xem ad mẫu</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// fetchChotot();

// Khi khởi động server: tải regions và wards theo area, lưu vào public-chotot/data/regions.json
(async () => {
    try {
        const regionsFile = path.join(dataDir, "regions.json");
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        // 1) Load regions
        const regionsRes = await axios.get("https://gateway.chotot.com/v1/public/web-proxy-api/loadRegions", { timeout: 20000 });
        const regions = regionsRes.data;

        // 2) Lấy region 13000 (TPHCM)
        const region13000 = regions?.regionFollowId?.entities?.regions?.["13000"];
        if (!region13000) {
            console.warn("Không tìm thấy region 13000 trong dữ liệu regions.");
            fs.writeFileSync(regionsFile, JSON.stringify(regions, null, 2), "utf-8");
            return;
        }

        const areasObj = region13000.area || {};
        const areaIds = Object.keys(areasObj);

        // 3) Với mỗi area, gọi API wards và gắn vào key wards
        for (const areaId of areaIds) {
            try {
                const wardsRes = await axios.get(`https://gateway.chotot.com/v2/public/chapy-pro/wards?area=${areaId}`, { timeout: 15000 });
                const wards = Array.isArray(wardsRes.data?.wards) ? wardsRes.data.wards : [];
                areasObj[areaId].wards = wards;
            } catch (err) {
                console.error(`Lỗi lấy wards cho area ${areaId}:`, err?.message || err);
            }
            // Delay ngắn tránh bị giới hạn
            await new Promise(r => setTimeout(r, 300));
        }

        // 4) Lưu toàn bộ cấu trúc (có wards) xuống file dạng minified
        fs.writeFileSync(regionsFile, JSON.stringify(regions), "utf-8");
        console.log(`✅ Đã lưu regions + wards vào ${regionsFile}`);
        
        // 5) Khởi tạo cron job crawl Chợ Tốt sau khi regions đã sẵn sàng
        // fetchChotot(); // Không cần await vì chỉ khởi tạo cron job
    } catch (err) {
        console.error("❌ Lỗi khi khởi tạo regions/wards:", err?.message || err);
    }
})();

// GET /api/sample-ad -> trả về ad đầu tiên từ sample-res.json (để tiện lấy list_id)
app.get("/api/sample-ad", (req, res) => {
    try {
        const p = path.join(__dirname, "sample-res.json");
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        const ad = Array.isArray(data?.ads) && data.ads.length ? data.ads[0] : null;
        if (!ad) return res.status(404).json({ error: "Không có ads trong sample-res.json" });
        res.json({ 
            list_id: ad.list_id,
            ad_id: ad.ad_id, 
            account_id: ad.account_id, 
            account_oid: ad.account_oid,
            subject: ad.subject
        });
    } catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});

// POST /upload-ads -> Upload file ads.json
app.post("/upload-ads", upload.single('adsFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Không có file được upload" });
        }

        const tempPath = req.file.path;
        const originalName = req.file.originalname.toLowerCase();

        // Kiểm tra file có phải JSON không
        if (!originalName.endsWith('.json')) {
            fs.unlinkSync(tempPath);
            return res.status(400).json({ error: "Chỉ chấp nhận file JSON" });
        }

        // Đọc và validate JSON
        const fileContent = fs.readFileSync(tempPath, 'utf8');
        let jsonData;
        try {
            jsonData = JSON.parse(fileContent);
        } catch (parseError) {
            fs.unlinkSync(tempPath);
            return res.status(400).json({ error: "File không phải JSON hợp lệ: " + parseError.message });
        }

        // Kiểm tra cấu trúc JSON có phải ads không
        if (!Array.isArray(jsonData) && !jsonData.ads) {
            fs.unlinkSync(tempPath);
            return res.status(400).json({ error: "File JSON không có cấu trúc ads hợp lệ" });
        }

        // Tạo thư mục data nếu chưa có
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Ghi file ads.json dạng minified
        const targetPath = path.join(dataDir, "ads.json");
        fs.writeFileSync(targetPath, JSON.stringify(jsonData), 'utf8');

        // Xóa file tạm
        fs.unlinkSync(tempPath);

        const fileSize = (fileContent.length / (1024 * 1024)).toFixed(2);
        const adsCount = Array.isArray(jsonData) ? jsonData.length : (jsonData.ads ? jsonData.ads.length : 0);

        res.json({
            success: true,
            message: `Upload thành công! File ads.json - Kích thước: ${fileSize}MB - Số ads: ${adsCount}`,
            fileSize: fileSize,
            adsCount: adsCount
        });

    } catch (err) {
        // Xóa file tạm nếu có lỗi
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: "Lỗi upload: " + err.message });
    }
});

// GET /download-ads -> Download file ads.json
app.get("/download-ads", (req, res) => {
    try {
        const adsFilePath = path.join(dataDir, "ads.json");
        
        if (!fs.existsSync(adsFilePath)) {
            return res.status(404).json({ error: "File ads.json không tồn tại" });
        }

        res.download(adsFilePath, "ads.json");
    } catch (err) {
        res.status(500).json({ error: "Lỗi download: " + err.message });
    }
});

// GET /api/ads -> Trả về dữ liệu từ tất cả các file area
app.get("/api/ads", (req, res) => {
    try {
        if (!fs.existsSync(dataDir)) {
            return res.status(404).json({ error: "Thư mục data không tồn tại" });
        }

        // Đọc tất cả file ads-*.json
        const files = fs.readdirSync(dataDir).filter(file => file.startsWith('ads-') && file.endsWith('.json'));
        
        if (files.length === 0) {
            return res.status(404).json({ error: "Không có file ads nào tồn tại" });
        }

        let allAds = [];
        const areaStats = {};

        for (const file of files) {
            try {
                const filePath = path.join(dataDir, file);
                const areaId = file.replace('ads-', '').replace('.json', '');
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                
                if (Array.isArray(data)) {
                    allAds = allAds.concat(data);
                    areaStats[areaId] = data.length;
                }
            } catch (err) {
                console.error(`Lỗi đọc file ${file}:`, err.message);
            }
        }

        // Merge và loại bỏ duplicate theo ad_id
        const uniqueAds = [];
        const seenIds = new Set();
        
        for (const ad of allAds) {
            if (ad.ad_id && !seenIds.has(ad.ad_id)) {
                seenIds.add(ad.ad_id);
                uniqueAds.push(ad);
            }
        }

        console.log(`📊 API /api/ads: ${files.length} files, ${allAds.length} total ads, ${uniqueAds.length} unique ads`);
        console.log(`📊 Area stats:`, areaStats);

        res.json(uniqueAds);
    } catch (err) {
        res.status(500).json({ error: "Lỗi đọc ads: " + err.message });
    }
});

app.listen(3001, () => {
    console.log("Chotot server chạy cổng 3001");
});




// =======================
//  Helper: RSA Encrypt h -> e
// =======================
const RSAPublicKey = {
    development: `-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAvWDFTP1FbbMuyJGbjnYa\ndtDGT3sCrpWxjse0VPQlKpYHsUarCD3BbQxz2ENHU3oNpyE+wo9vwDsvC54PLw+K\n1xIONydFXTj0pYUrraxUbzA8LpMqfgcC5BOTf2YgA1hHLG9R0jKaBFixt5UbPFi8\nyHDKmsG271RRb4qtmQh+1E/CdPWrd3080Dg3RLt7zSBU89B6YWiBNy0a7XZe8eaz\nHXJyfdZDJnWGdovvJ/fMLGNaAQ4K9iAHCunywMU3grHwkNJt6DMnYBHfJ6MEXvWs\n659NsHHsigkqifxPhUGAdYpilX8IR8/6CLnhrv4J/DfpHC7o0dg7FGUkLk5rZqmK\nigpSlRE1f8sJai5NfZ/bUx7rVh1bobx78y8dB/sddqM/kqax4HE+PPn3cFZyGKlg\nG/pJuyfZOs/RHmE1ogCYl/dJGk6ApDcLO9NMB3aHFGg8mmdxmHBLLxqct4PS4935\nqoIemjkYbHZBRanpZ8M/AgfmSxsBdS1QVaj4ekeouxsTAgMBAAE=\n-----END PUBLIC KEY-----`,
    staging: `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzJlNCa64Rmoj3YPKnDuH\nzljGsjGhQNJxpRcq6zQ2Vw/hU8ilJEDMLj9j5jvSHGViOF2w4wJKA6Se/ScylyMO\n0yV9s0smzauCvbiyKRtuYH1i3pGemfvYGkQHPFeyi4xeX3+GUtJS3C5x9DRRqZsm\nzQH4MjPaEoBMpMN6MowVBs4r99s5FXe0wMQhPOlxEav2s1+TxSgrQrpiEE9kc6/a\n/6T1NIRE30Lx7HhSh7GZyQ4QtAz35J98xZTWwv1pqvtFfai64A8nQHMkG+Lkndqz\nSDFNM2GHKW10i5cyqLiHQsfOF0dHd42cky9RKLuD5wld6nKd3i0VGNrmxsbP8Nva\nWQIDAQAB\n-----END PUBLIC KEY-----`,
    production: `-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAxnvPjlA/K/adq6mA6+uU\ntlyBBxFaKeK+WD2FypOeCAP0qtucmaDrIbxirykrxQjRpGxl2HKRBwGd2h/hDuk9\nCxRUXD2p0Hrzb1Hb9M5px19TPXM6AWSClR1kozehRusIFrxP6PHqDLx5prJFLlSZ\nzg3N3oGhS6oP/a4Ku/iAdCUCiHb5TX3b3+y4Ll/QViZhpKZjU6BhIOsiVIJhyXvn\n0cSqLXPjNuXR5A4JkmRl9T9cWncEHTKmoVUyXQJaDZa3yH/OJSEmhhGyKNKkM5so\nlasJWSBKenFnFvphw3+KG8BGfJwGkvtRAVbS1ljduH8z8fxALxHgUdnTtgpxB+KZ\n/CVnNr97EGqYPLVlX+duGkuy1yCunqVTiY2HyL/0bMTBK84oCQjtMVAHgZ345hZn\nmGST71D8+i5HGtOOFoRyP6qK6ex1qfEROzWsmVDA00aHLlQcKOLaHvT/DB30aeUs\nZoL/kQo100XccufpHESrits0mEuoyza4CCFM04F3pDOXAgMBAAE=\n-----END PUBLIC KEY-----`
};

function encryptToE(h, env = "production") {
    const key = RSAPublicKey[env] || RSAPublicKey.production;
    const cipherB64 = crypto.publicEncrypt(
        { key, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(String(h), "utf8")
    ).toString("base64");
    return { e: encodeURIComponent(cipherB64), raw: cipherB64 };
}

// GET /api/demo-phone
// Cách dùng:
// - /api/demo-phone?h=<list_id>&env=production&auth=0 -> lấy số điện thoại (public)
// - /api/demo-phone?h=<list_id>&env=production&auth=1&token=<privateToken> -> lấy số điện thoại (private)
// 
// Trong đó:
// - h: chính là list_id của tin đăng (ví dụ: 127122198)
// - env: môi trường (development/staging/production), mặc định production
// - auth: 0 = public API, 1 = private API (cần token)
// - token: Bearer token (chỉ cần khi auth=1)
//
// Ví dụ:
// - GET /api/demo-phone?h=127122198&env=production&auth=0
// - GET /api/demo-phone?h=127122198&env=production&auth=1&token=abc123
app.get("/api/demo-phone", async (req, res) => {
    try {
        const { h, env = "production", auth = "0", token } = req.query;
        if (!h) return res.status(400).json({ error: "Thiếu query 'h' (list_id)" });
        
        // Mã hóa list_id thành e
        const e = encryptToE(h, env).e;
        
        // Gọi API phone
        const isPrivate = auth === "1";
        const url = `https://gateway.chotot.com/v1/${isPrivate ? "private" : "public"}/ad-listing/phone?e=${e}`;
        const headers = {};
        if (isPrivate && token) headers["Authorization"] = `Bearer ${token}`;
        
        const resp = await axios.get(url, { headers, timeout: 20000 });
        res.json(resp.data);
    } catch (err) {
        res.status(err?.response?.status || 500).json({ 
            error: err?.message || String(err), 
            data: err?.response?.data 
        });
    }
});

cron.schedule('* * * * *', async () => {
    try {
        console.log("Đang gọi url thành công lúc", new Date().toLocaleString());
        await axios.get('https://nhatot.onrender.com/');
        console.log('Đã gọi url thành công lúc', new Date().toLocaleString());
    } catch (err) {
        console.error('Lỗi khi gọi url:', err.message);
    }
});