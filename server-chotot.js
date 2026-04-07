import 'dotenv/config';
import express from "express";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import multer from "multer";
import fetchChotot from "./fetchChotot.js";
import cron from "node-cron";
import { backupAdImages, batchBackupAdsFromMysql } from "./imageBackup.js";
import * as chototMysql from "./db/chototMysql.js";
import { cloudinaryAccounts } from "./cloudinaryConfig.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "public-chotot", "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
app.use(express.static("public-chotot"));

const dataUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, dataDir),
        filename: (_req, file, cb) => {
            // Keep original filename but normalize to avoid invalid paths.
            const safeName = path.basename(file.originalname || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
            cb(null, safeName || `upload-${Date.now()}.bin`);
        }
    })
});

if (!chototMysql.isEnabled()) {
    throw new Error("MySQL must be enabled. JSON runtime mode has been removed.");
}

const CATEGORY_NAMES = {
    '1050': 'tro',
    '1020': 'nha'
};

// fetchChotot();

// Khi khởi động server: đồng bộ region/area/ward vào MySQL để frontend filter dùng relationship.
(async () => {
    try {
        await chototMysql.ensureSchema();
        console.log("✅ Chotot MySQL schema ready");

        // 1) Load regions
        const regionsRes = await axios.get("https://gateway.chotot.com/v1/public/web-proxy-api/loadRegions", { timeout: 20000 });
        const regions = regionsRes.data;

        // 2) Lấy region 13000 (TPHCM)
        const region13000 = regions?.regionFollowId?.entities?.regions?.["13000"];
        if (!region13000) throw new Error("Không tìm thấy region 13000 trong dữ liệu regions.");

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

        // 4) Persist relationship region -> area -> ward vào MySQL
        await chototMysql.upsertRegionTreeFromPayload(regions, 13000);
        console.log(`✅ Region/area/ward đã đồng bộ vào MySQL`);
        
        // 5) Khởi tạo cron job crawl Chợ Tốt sau khi regions đã sẵn sàng
        const enableCronjob = process.env.ENABLE_CRONJOB === 'true';
        if (enableCronjob) {
            console.log('🔄 Cronjob enabled - Starting Chợ Tốt crawler...');
            fetchChotot(); // Không cần await vì chỉ khởi tạo cron job
        } else {
            console.log('⏸️  Cronjob disabled - Skipping Chợ Tốt crawler (set ENABLE_CRONJOB=true to enable)');
        }
    } catch (err) {
        console.error("❌ Lỗi khi khởi tạo regions/wards:", err?.message || err);
    }
})();

// GET /api/regions — hierarchical relationship for filter UI (region -> areas -> wards)
app.get("/api/regions", async (req, res) => {
    try {
        const region = req.query.region ? Number(req.query.region) : 13000;
        const tree = await chototMysql.getRegionTree(region);
        return res.json(tree);
    } catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});

// GET /api/ads/map — lightweight points for Leaflet (MySQL only; same filters as list V2)
app.get("/api/ads/map", async (req, res) => {
    try {
        if (!chototMysql.isEnabled()) {
            return res.status(503).json({ error: "Map API requires MySQL" });
        }
        const filters = chototMysql.parseAdsFilterFromQuery(req.query);
        if (filters.category !== "all" && !CATEGORY_NAMES[filters.category]) {
            return res.status(400).json({ error: "Invalid category parameter" });
        }
        const data = await chototMysql.queryMapPointsV2(filters);
        console.log(`📊 API /api/ads/map: items=${data.items?.length ?? 0}`);
        return res.json(data);
    } catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});

// GET /api/ads/:adId — full assembled ad for modal/detail (MySQL only)
app.get("/api/ads/:adId", async (req, res) => {
    try {
        const raw = req.params.adId;
        if (!/^\d+$/.test(String(raw))) {
            return res.status(400).json({ error: "Invalid ad_id" });
        }
        if (!chototMysql.isEnabled()) {
            return res.status(503).json({ error: "Detail API requires MySQL" });
        }
        const ad = await chototMysql.getListingByAdId(raw);
        if (!ad) return res.status(404).json({ error: "Ad not found" });
        return res.json(ad);
    } catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});

// GET /api/ads -> V2 { items, total?, offset, limit, has_more } (MySQL only)
app.get("/api/ads", async (req, res) => {
    try {
        const category = req.query.category || 'all'; // 'all', '1050', '1020'
        if (category !== 'all' && !CATEGORY_NAMES[category]) {
            return res.status(400).json({ error: "Invalid category parameter" });
        }
        const filters = chototMysql.parseAdsFilterFromQuery(req.query);
        const data = await chototMysql.queryAdsListV2(filters);
        console.log(
            `📊 API /api/ads v2: offset=${data.offset} limit=${data.limit} has_more=${data.has_more} total=${data.total ?? 'n/a'} items=${data.items.length}`
        );
        return res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Lỗi đọc ads: " + err.message });
    }
});

// POST /api/backup-images - Backup images for specific ad
app.post("/api/backup-images", express.json(), async (req, res) => {
    try {
        const { ad_id } = req.body;

        if (!ad_id) {
            return res.status(400).json({ error: "Missing ad_id" });
        }

        const ad = await chototMysql.getListingByAdId(ad_id);
        if (!ad) {
            return res.status(404).json({ error: "Ad not found" });
        }

        if (ad.company_ad === true) {
            return res.status(400).json({ error: "Cannot backup company ads" });
        }

        const result = await backupAdImages(ad);

        if (result.success) {
            ad.imgs_bak = result.results;
            await chototMysql.saveListingPayload(ad);

            return res.json({
                success: true,
                ad_id: ad.ad_id,
                backed_up: result.backed_up,
                total: result.total,
                imgs_bak: ad.imgs_bak
            });
        }

        if (result.results && result.results.length > 0) {
            ad.imgs_bak = result.results;
            await chototMysql.saveListingPayload(ad);
        }

        return res.status(500).json({
            success: false,
            reason: result.reason
        });
    } catch (error) {
        console.error('Backup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/batch-backup - Batch backup all personal ads from MySQL
app.post("/api/batch-backup", express.json(), async (req, res) => {
    try {
        res.json({
            success: true,
            message: "MySQL batch backup started in background",
            source: "mysql"
        });

        batchBackupAdsFromMysql().catch((err) => {
            console.error('Background MySQL batch backup error:', err);
        });
    } catch (error) {
        console.error('Batch backup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/sellers/:accountOid/phones — accumulated numbers for account_oid (plan chotot_json_to_sql)
app.get("/api/sellers/:accountOid/phones", async (req, res) => {
    try {
        if (!chototMysql.isEnabled()) {
            return res.status(503).json({ error: "MySQL not enabled" });
        }
        const accountOid = req.params.accountOid;
        const phones = await chototMysql.getSellerPhones(accountOid);
        res.json({ account_oid: accountOid, phones });
    } catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});

async function fetchPhoneByListId(listId, env = "production") {
    try {
        const e = encryptToE(listId, env).e;
        const url = `https://gateway.chotot.com/v1/public/ad-listing/phone?e=${e}`;
        const resp = await axios.get(url, { timeout: 20000 });
        const phone = resp?.data?.phone;
        return { phone: phone || null, hiddenExpired: false };
    } catch (err) {
        if (err?.status == 404 && err?.response?.data?.message?.includes(String(listId))) {
            return { phone: null, hiddenExpired: true };
        }
        return { phone: null, hiddenExpired: false };
    }
}

async function fetchListIdsByAccountOid(accountOid) {
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
    }
    return [...new Set(out)];
}

// POST /api/sellers/:accountOid/phones/fetch
// Fetch phones from Theia list_ids and persist into chotot_seller_phone.
app.post("/api/sellers/:accountOid/phones/fetch", express.json(), async (req, res) => {
    try {
        const accountOid = req.params.accountOid;
        if (!accountOid) return res.status(400).json({ error: "Missing accountOid" });
        const skipSavedSource = true;

        const listIds = await fetchListIdsByAccountOid(accountOid);
        const knownSourceIds = skipSavedSource
            ? new Set(await chototMysql.getSellerPhoneSourceAdIds(accountOid))
            : new Set();

        const insertEntries = [];
        let hiddenCount = 0;
        for (const listId of listIds) {
            if (knownSourceIds.has(Number(listId))) continue;
            const r = await fetchPhoneByListId(listId, "production");
            if (r.hiddenExpired) {
                hiddenCount += 1;
            }
            if (r.phone) {
                insertEntries.push({ phone: r.phone, source_ad_id: listId });
            }
            await new Promise((rslv) => setTimeout(rslv, 120));
        }

        const inserted = await chototMysql.upsertSellerPhones(accountOid, insertEntries);
        const phones = await chototMysql.getSellerPhones(accountOid);
        return res.json({
            account_oid: accountOid,
            requested_list_ids: listIds.length,
            hidden_expired_count: hiddenCount,
            fetched_entries: insertEntries.length,
            inserted,
            phones
        });
    } catch (err) {
        return res.status(500).json({ error: err?.message || String(err) });
    }
});

// GET /api/cloudinary-status - Check Cloudinary accounts status
app.get("/api/cloudinary-status", (req, res) => {
    res.json({
        accounts: cloudinaryAccounts.length,
        details: cloudinaryAccounts.map(acc => ({
            cloudName: acc.cloudName,
            uploadCount: acc.uploadCount,
            storageUsed: acc.storageUsed
        }))
    });
});

// Admin page: list data files + upload + download
app.get("/admin/data-files", async (_req, res) => {
    try {
        const entries = await fs.promises.readdir(dataDir, { withFileTypes: true });
        const files = await Promise.all(
            entries
                .filter((e) => e.isFile())
                .map(async (e) => {
                    const full = path.join(dataDir, e.name);
                    const stat = await fs.promises.stat(full);
                    return {
                        name: e.name,
                        size: stat.size,
                        mtime: stat.mtime
                    };
                })
        );
        files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        const rows = files
            .map((f) => {
                const href = `/admin/data-files/download/${encodeURIComponent(f.name)}`;
                return `<tr>
  <td>${f.name}</td>
  <td>${f.size.toLocaleString("en-US")} bytes</td>
  <td>${f.mtime.toLocaleString("vi-VN")}</td>
  <td><a href="${href}">Download</a></td>
</tr>`;
            })
            .join("\n");

        // Hidden anchors for "Download all" — triggers one browser download per file (no zip).
        const downloadAllAnchors = files
            .map((f) => {
                const href = `/admin/data-files/download/${encodeURIComponent(f.name)}`;
                const escDownload = String(f.name)
                    .replace(/&/g, "&amp;")
                    .replace(/"/g, "&quot;")
                    .replace(/</g, "&lt;");
                return `<a href="${href}" download="${escDownload}"></a>`;
            })
            .join("\n");

        const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Data Files</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { margin-bottom: 8px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
    th { background: #f5f5f5; }
    .muted { color: #666; font-size: 13px; }
    .row-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
    button.secondary { background: #f0f0f0; border: 1px solid #ccc; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 14px; }
    button.secondary:hover:not(:disabled) { background: #e5e5e5; }
    button.secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <h1>public-chotot/data</h1>
  <p class="muted">Upload file mới hoặc tải file hiện có. &quot;Download all&quot; tải từng file (không nén zip).</p>

  <div class="card">
    <form action="/admin/data-files/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="file" required />
      <button type="submit">Upload</button>
    </form>
  </div>

  <div class="card">
    <div class="row-actions">
      <button type="button" class="secondary" id="download-all-btn" ${files.length === 0 ? "disabled" : ""}>Download all</button>
      <span class="muted" id="download-all-hint" style="display: none;">Đang kích hoạt tải từng file…</span>
    </div>
    <div id="download-all-sources" style="position:absolute;width:0;height:0;overflow:hidden;" aria-hidden="true">
${downloadAllAnchors}
    </div>
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Size</th>
          <th>Updated</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4">No files</td></tr>`}
      </tbody>
    </table>
  </div>
  <script>
  (function () {
    var btn = document.getElementById("download-all-btn");
    var hint = document.getElementById("download-all-hint");
    var box = document.getElementById("download-all-sources");
    if (!btn || !box) return;
    btn.addEventListener("click", function () {
      var links = box.querySelectorAll("a[href]");
      if (!links.length) return;
      if (hint) hint.style.display = "inline";
      var delayMs = 400;
      links.forEach(function (a, i) {
        setTimeout(function () {
          a.click();
          if (i === links.length - 1 && hint) {
            setTimeout(function () { hint.style.display = "none"; }, 600);
          }
        }, i * delayMs);
      });
    });
  })();
  </script>
</body>
</html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
    } catch (err) {
        return res.status(500).send(`Error listing files: ${err?.message || err}`);
    }
});

app.post("/admin/data-files/upload", dataUpload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).send("Missing file");
    }
    return res.redirect("/admin/data-files");
});

app.get("/admin/data-files/download/:name", (req, res) => {
    const raw = String(req.params.name || "");
    const safeName = path.basename(raw);
    if (!safeName) return res.status(400).send("Invalid filename");
    const full = path.join(dataDir, safeName);
    if (!fs.existsSync(full)) return res.status(404).send("File not found");
    return res.download(full, safeName);
});

app.listen(3009, () => {
    console.log("Chotot server chạy cổng 3009");
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
        await axios.get('https://nhatot.onrender.com/');
    } catch (err) {
        console.error('Lỗi khi gọi url:', err.message);
    }
});