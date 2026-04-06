import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import {
    isEnabled,
    ensureSchema,
    replaceAreaCategoryListings,
    upsertRegionTreeFromPayload,
    closePool
} from '../db/chototMysql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'public-chotot', 'data');

const CATEGORY_BY_NAME = { tro: 1050, nha: 1020 };

/**
 * ads-13118-tro.json -> area 13118, category 1050
 */
function parseAdsFilename(name) {
    const m = name.match(/^ads-(\d+)-(tro|nha)\.json$/);
    if (!m) return null;
    return { areaV2: parseInt(m[1], 10), categoryNum: CATEGORY_BY_NAME[m[2]], kind: m[2] };
}

async function main() {
    if (!isEnabled()) {
        console.error('MySQL not enabled. Set MYSQL_HOST, MYSQL_DATABASE, or CHOTOT_USE_MYSQL=true');
        process.exit(1);
    }
    await ensureSchema();
    try {
        const regionsRes = await axios.get('https://gateway.chotot.com/v1/public/web-proxy-api/loadRegions', {
            timeout: 20000
        });
        const regions = regionsRes.data;
        const region13000 = regions?.regionFollowId?.entities?.regions?.['13000'];
        const areasObj = region13000?.area || {};
        const areaIds = Object.keys(areasObj);
        for (const areaId of areaIds) {
            try {
                const wardsRes = await axios.get(
                    `https://gateway.chotot.com/v2/public/chapy-pro/wards?area=${areaId}`,
                    { timeout: 15000 }
                );
                const wards = Array.isArray(wardsRes.data?.wards) ? wardsRes.data.wards : [];
                areasObj[areaId].wards = wards;
            } catch (err) {
                console.error(`Skip wards sync for area ${areaId}:`, err?.message || err);
            }
        }
        await upsertRegionTreeFromPayload(regions, 13000);
        console.log('Region relationship imported to MySQL (region/area/ward).');
    } catch (err) {
        console.error('Region relationship import failed:', err?.message || err);
    }

    if (!fs.existsSync(dataDir)) {
        console.error('Data dir missing:', dataDir);
        process.exit(1);
    }

    const files = fs.readdirSync(dataDir).filter((f) => /^ads-\d+-(tro|nha)\.json$/.test(f));
    files.sort();

    console.log(`Found ${files.length} area JSON files`);

    for (const file of files) {
        const meta = parseAdsFilename(file);
        if (!meta) continue;
        const full = path.join(dataDir, file);
        let ads;
        try {
            ads = JSON.parse(fs.readFileSync(full, 'utf-8'));
        } catch (e) {
            console.error(`Skip ${file}:`, e.message);
            continue;
        }
        if (!Array.isArray(ads)) {
            console.warn(`Skip ${file}: not an array`);
            continue;
        }
        const normalizedAds = ads.map((ad) => {
            if (!ad || typeof ad !== 'object') return ad;
            // relative_date_text/date is deprecated; UI renders from list_time only.
            const out = { ...ad };
            delete out.date;
            return out;
        });
        await replaceAreaCategoryListings(meta.areaV2, meta.categoryNum, normalizedAds);
        console.log(`Imported ${file}: ${ads.length} ads (area=${meta.areaV2}, category=${meta.categoryNum})`);
    }

    await closePool();
    console.log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
