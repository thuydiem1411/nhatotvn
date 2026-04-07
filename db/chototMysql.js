import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool = null;

/**
 * MySQL is used when CHOTOT_USE_MYSQL=true or when MYSQL_HOST and MYSQL_DATABASE are set.
 */
export function isEnabled() {
    const explicit = (process.env.CHOTOT_USE_MYSQL ?? '').toLowerCase() === 'true';
    const implicit = Boolean(process.env.MYSQL_HOST && process.env.MYSQL_DATABASE);
    return explicit || implicit;
}

function getPool() {
    if (!isEnabled()) return null;
    if (pool) return pool;
    const port = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306;
    pool = mysql.createPool({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: true,
        multipleStatements: true
    });
    return pool;
}

function toTinyInt(v) {
    if (v === true || v === 1) return 1;
    if (v === false || v === 0) return 0;
    if (v == null) return null;
    return v ? 1 : 0;
}

function numOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
    if (v == null || v === '') return null;
    return String(v);
}

/** Store top-level `shop` object as JSON string for MySQL JSON column. */
function shopJsonForDb(ad) {
    if (ad.shop == null || ad.shop === '') return null;
    if (typeof ad.shop === 'object') return JSON.stringify(ad.shop);
    return String(ad.shop);
}

/**
 * Disassemble: flat JSON ad -> listing row scalars (plan: keys from Chotot JSON + shop_json).
 * has_img_backup_ok is not persisted (single source: chotot_listing_image_backup; derive at read/assemble).
 */
function listingScalarsFromAd(ad, areaV2, categoryNum) {
    const cat = ad.category != null ? parseInt(String(ad.category), 10) : categoryNum;
    return {
        ad_id: Number(ad.ad_id),
        list_id: Number(ad.list_id),
        account_id: numOrNull(ad.account_id),
        account_oid: strOrNull(ad.account_oid),
        region: numOrNull(ad.region),
        region_v2: numOrNull(ad.region_v2),
        area: numOrNull(ad.area),
        area_v2: areaV2,
        ward: numOrNull(ad.ward),
        category: Number.isFinite(cat) ? cat : categoryNum,
        category_name: strOrNull(ad.category_name),
        company_ad: ad.company_ad === true ? 1 : 0,
        subject: strOrNull(ad.subject),
        body: strOrNull(ad.body),
        price: numOrNull(ad.price),
        price_string: strOrNull(ad.price_string),
        deposit: numOrNull(ad.deposit),
        size: numOrNull(ad.size),
        size_unit_string: strOrNull(ad.size_unit_string),
        list_time: numOrNull(ad.list_time),
        orig_list_time: numOrNull(ad.orig_list_time),
        state: strOrNull(ad.state),
        status: strOrNull(ad.status),
        ad_type: strOrNull(ad.type),
        account_name: strOrNull(ad.account_name),
        longitude: numOrNull(ad.longitude),
        latitude: numOrNull(ad.latitude),
        location: strOrNull(ad.location),
        street_number: strOrNull(ad.street_number),
        street_name: strOrNull(ad.street_name),
        street_number_display: toTinyInt(ad.streetnumber_display),
        location_id: strOrNull(ad.location_id),
        unique_street_id: strOrNull(ad.unique_street_id),
        is_main_street: toTinyInt(ad.is_main_street),
        contain_videos: numOrNull(ad.contain_videos),
        number_of_images: numOrNull(ad.number_of_images),
        pty_jupiter: numOrNull(ad.pty_jupiter),
        pty_map: strOrNull(ad.pty_map),
        pty_map_modifier: numOrNull(ad.pty_map_modifier),
        pty_project_name: strOrNull(ad.pty_project_name),
        price_million_per_m2: numOrNull(ad.price_million_per_m2),
        protection_entitlement: toTinyInt(ad.protection_entitlement),
        is_sticky: toTinyInt(ad.is_sticky),
        is_zalo_show: toTinyInt(ad.is_zalo_show),
        job_tier: numOrNull(ad.job_tier),
        furnishing_rent: numOrNull(ad.furnishing_rent),
        furnishing_sell: numOrNull(ad.furnishing_sell),
        has_video: toTinyInt(ad.has_video),
        house_type: numOrNull(ad.house_type),
        floors: numOrNull(ad.floors),
        direction: numOrNull(ad.direction),
        detail_address: strOrNull(ad.detail_address),
        rooms: numOrNull(ad.rooms),
        toilets: numOrNull(ad.toilets),
        length: numOrNull(ad.length),
        width: numOrNull(ad.width),
        living_size: numOrNull(ad.living_size),
        property_legal_document: numOrNull(ad.property_legal_document),
        block: ad.block != null && ad.block !== '' ? String(ad.block) : null,
        is_good_room: toTinyInt(ad.is_good_room),
        is_block_similar_ads_other_agent: toTinyInt(ad.is_block_similar_ads_other_agent),
        project_oid: strOrNull(ad.project_oid),
        project_id: numOrNull(ad.projectid),
        unit_number: strOrNull(ad.unitnumber),
        unit_number_display: toTinyInt(ad.unitnumber_display),
        shop_alias: strOrNull(ad.shop_alias),
        shop_json: shopJsonForDb(ad),
        special_display: toTinyInt(ad.special_display),
        sticky_ad_type: strOrNull(ad.sticky_ad_type),
        sticky_ad_feature: strOrNull(ad.stickyad_feature),
        total_rating: numOrNull(ad.total_rating),
        total_rating_for_seller: numOrNull(ad.total_rating_for_seller),
        average_rating: numOrNull(ad.average_rating),
        average_rating_for_seller: numOrNull(ad.average_rating_for_seller),
        phone: strOrNull(ad.phone),
        phone_hidden: ad.phone_hidden != null && ad.phone_hidden !== '' ? String(ad.phone_hidden) : null,
        region_name: strOrNull(ad.region_name),
        region_name_v3: strOrNull(ad.region_name_v3),
        area_name: strOrNull(ad.area_name),
        ward_name: strOrNull(ad.ward_name),
        ward_name_v3: strOrNull(ad.ward_name_v3)
    };
}

async function columnExists(conn, table, col) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [table, col]
    );
    return r.length > 0;
}

async function migrateListingRenames(conn) {
    if (await columnExists(conn, 'chotot_listing', 'type')) {
        if (await columnExists(conn, 'chotot_listing', 'ad_type')) {
            await conn.query('UPDATE chotot_listing SET ad_type = COALESCE(ad_type, `type`)');
            await conn.query('ALTER TABLE chotot_listing DROP COLUMN `type`');
        } else {
            await conn.query('ALTER TABLE chotot_listing CHANGE COLUMN `type` `ad_type` VARCHAR(16) NULL');
        }
    }
    if (await columnExists(conn, 'chotot_listing', 'date_display')) {
        await conn.query('ALTER TABLE chotot_listing DROP COLUMN date_display');
    }
    if (await columnExists(conn, 'chotot_listing', 'relative_date_text')) {
        await conn.query('ALTER TABLE chotot_listing DROP COLUMN relative_date_text');
    }
    if (await columnExists(conn, 'chotot_listing', 'streetnumber_display')) {
        if (await columnExists(conn, 'chotot_listing', 'street_number_display')) {
            await conn.query(
                'UPDATE chotot_listing SET street_number_display = COALESCE(street_number_display, streetnumber_display)'
            );
            await conn.query('ALTER TABLE chotot_listing DROP COLUMN streetnumber_display');
        } else {
            await conn.query(
                'ALTER TABLE chotot_listing CHANGE COLUMN streetnumber_display street_number_display TINYINT(1) NULL'
            );
        }
    }
    for (const legacy of ['image', 'webp_image', 'thumbnail_image', 'payload']) {
        if (await columnExists(conn, 'chotot_listing', legacy)) {
            await conn.query(`ALTER TABLE chotot_listing DROP COLUMN \`${legacy}\``);
        }
    }
}

/** Add any plan listing column missing (after renames). */
const LISTING_PLAN_ADD_COLUMNS = [
    ['region', 'INT NULL'],
    ['region_v2', 'INT NULL'],
    ['area', 'INT NULL'],
    ['subject', 'VARCHAR(512) NULL'],
    ['body', 'MEDIUMTEXT NULL'],
    ['price_string', 'VARCHAR(255) NULL'],
    ['deposit', 'BIGINT NULL'],
    ['size', 'INT NULL'],
    ['size_unit_string', 'VARCHAR(32) NULL'],
    ['orig_list_time', 'BIGINT NULL'],
    ['state', 'VARCHAR(64) NULL'],
    ['status', 'VARCHAR(64) NULL'],
    ['ad_type', 'VARCHAR(16) NULL'],
    ['account_name', 'VARCHAR(512) NULL'],
    ['category_name', 'VARCHAR(255) NULL'],
    ['longitude', 'DOUBLE NULL'],
    ['latitude', 'DOUBLE NULL'],
    ['location', 'VARCHAR(255) NULL'],
    ['street_number', 'VARCHAR(512) NULL'],
    ['street_name', 'VARCHAR(512) NULL'],
    ['street_number_display', 'TINYINT(1) NULL'],
    ['location_id', 'VARCHAR(255) NULL'],
    ['unique_street_id', 'VARCHAR(128) NULL'],
    ['is_main_street', 'TINYINT(1) NULL'],
    ['contain_videos', 'INT NULL'],
    ['number_of_images', 'SMALLINT NULL'],
    ['pty_jupiter', 'INT NULL'],
    ['pty_map', 'VARCHAR(2048) NULL'],
    ['pty_map_modifier', 'DOUBLE NULL'],
    ['pty_project_name', 'VARCHAR(512) NULL'],
    ['price_million_per_m2', 'DOUBLE NULL'],
    ['protection_entitlement', 'TINYINT(1) NULL'],
    ['is_sticky', 'TINYINT(1) NULL'],
    ['is_zalo_show', 'TINYINT(1) NULL'],
    ['job_tier', 'INT NULL'],
    ['furnishing_rent', 'SMALLINT NULL'],
    ['furnishing_sell', 'SMALLINT NULL'],
    ['has_video', 'TINYINT(1) NULL'],
    ['house_type', 'SMALLINT NULL'],
    ['floors', 'SMALLINT NULL'],
    ['direction', 'SMALLINT NULL'],
    ['detail_address', 'VARCHAR(512) NULL'],
    ['rooms', 'INT NULL'],
    ['toilets', 'INT NULL'],
    ['length', 'INT NULL'],
    ['width', 'INT NULL'],
    ['living_size', 'INT NULL'],
    ['property_legal_document', 'INT NULL'],
    ['block', 'VARCHAR(512) NULL'],
    ['is_good_room', 'TINYINT(1) NULL'],
    ['is_block_similar_ads_other_agent', 'TINYINT(1) NULL'],
    ['project_oid', 'VARCHAR(128) NULL'],
    ['project_id', 'INT NULL'],
    ['unit_number', 'VARCHAR(64) NULL'],
    ['unit_number_display', 'TINYINT(1) NULL'],
    ['shop_alias', 'VARCHAR(255) NULL'],
    ['shop_json', 'JSON NULL'],
    ['special_display', 'TINYINT(1) NULL'],
    ['sticky_ad_type', 'VARCHAR(64) NULL'],
    ['sticky_ad_feature', 'VARCHAR(512) NULL'],
    ['total_rating', 'INT NULL'],
    ['total_rating_for_seller', 'INT NULL'],
    ['average_rating', 'TINYINT NULL'],
    ['average_rating_for_seller', 'TINYINT NULL'],
    ['phone_hidden', 'VARCHAR(64) NULL'],
    ['region_name', 'VARCHAR(255) NULL'],
    ['region_name_v3', 'VARCHAR(255) NULL'],
    ['area_name', 'VARCHAR(255) NULL'],
    ['ward_name', 'VARCHAR(255) NULL'],
    ['ward_name_v3', 'VARCHAR(255) NULL']
];

async function migrateListingPlanColumns(conn) {
    const [cols] = await conn.query(
        `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chotot_listing'`
    );
    const have = new Set(cols.map((r) => r.c));
    for (const [name, def] of LISTING_PLAN_ADD_COLUMNS) {
        if (have.has(name)) continue;
        await conn.query(`ALTER TABLE chotot_listing ADD COLUMN \`${name}\` ${def}`);
    }
}

async function migrateMediaTable(conn) {
    const t = 'chotot_listing_media';
    if (!(await columnExists(conn, t, 'id'))) return;

    if (await columnExists(conn, t, 'url')) {
        if (await columnExists(conn, t, 'media_url')) {
            await conn.query(`UPDATE ${t} SET media_url = COALESCE(media_url, url)`);
            await conn.query(`ALTER TABLE ${t} DROP COLUMN url`);
        } else {
            await conn.query(`ALTER TABLE ${t} CHANGE COLUMN url media_url TEXT NULL`);
        }
    }

    for (const [name, def] of [
        ['media_url', 'TEXT NULL'],
        ['video_thumbnail_url', 'TEXT NULL'],
        ['video_gif_url', 'TEXT NULL'],
        ['video_external_id', 'BIGINT NULL']
    ]) {
        if (!(await columnExists(conn, t, name))) {
            await conn.query(`ALTER TABLE ${t} ADD COLUMN \`${name}\` ${def}`);
        }
    }

    if (await columnExists(conn, t, 'extras_json')) {
        const [rows] = await conn.query(`SELECT id, extras_json FROM ${t} WHERE extras_json IS NOT NULL`);
        for (const r of rows) {
            let o = r.extras_json;
            if (typeof o === 'string') {
                try {
                    o = JSON.parse(o);
                } catch {
                    o = null;
                }
            }
            if (!o || typeof o !== 'object') continue;
            const vid = o.id != null && Number.isFinite(Number(o.id)) ? Number(o.id) : null;
            await conn.execute(
                `UPDATE ${t} SET media_url = COALESCE(media_url, ?), video_thumbnail_url = ?, video_gif_url = ?, video_external_id = COALESCE(video_external_id, ?) WHERE id = ?`,
                [o.url ?? null, o.thumbnail ?? null, o.gif_url ?? null, vid, r.id]
            );
        }
        await conn.query(`ALTER TABLE ${t} DROP COLUMN extras_json`);
    }

    if (await columnExists(conn, t, 'sort_order')) {
        await conn.query(`ALTER TABLE ${t} DROP COLUMN sort_order`);
    }
}

async function migrateBackupTable(conn) {
    const t = 'chotot_listing_image_backup';
    if (!(await columnExists(conn, t, 'id'))) return;

    const renames = [
        ['src_filename', 'backup_source_key', 'VARCHAR(512) NULL'],
        ['bak_url', 'backup_storage_ref', 'TEXT NULL'],
        ['cloud_name', 'backup_cloud_name', 'VARCHAR(64) NULL'],
        ['status_code', 'backup_status', 'VARCHAR(32) NULL']
    ];
    for (const [oldName, newName, def] of renames) {
        if (await columnExists(conn, t, oldName)) {
            if (await columnExists(conn, t, newName)) {
                await conn.query(`UPDATE ${t} SET ${newName} = COALESCE(${newName}, ${oldName})`);
                await conn.query(`ALTER TABLE ${t} DROP COLUMN ${oldName}`);
            } else {
                await conn.query(`ALTER TABLE ${t} CHANGE COLUMN ${oldName} ${newName} ${def}`);
            }
        }
    }

    for (const [name, def] of [
        ['backup_source_key', 'VARCHAR(512) NULL'],
        ['backup_storage_ref', 'TEXT NULL'],
        ['backup_cloud_name', 'VARCHAR(64) NULL'],
        ['backup_status', 'VARCHAR(32) NULL']
    ]) {
        if (!(await columnExists(conn, t, name))) {
            await conn.query(`ALTER TABLE ${t} ADD COLUMN \`${name}\` ${def}`);
        }
    }

    if (await columnExists(conn, t, 'sort_order')) {
        await conn.query(`ALTER TABLE ${t} DROP COLUMN sort_order`);
    }

    const [bakStatusIdx] = await conn.query(
        `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'idx_bak_ad_status' LIMIT 1`,
        [t]
    );
    if (!bakStatusIdx.length) {
        try {
            await conn.query(`ALTER TABLE ${t} ADD INDEX idx_bak_ad_status (ad_id, backup_status)`);
        } catch (e) {
            if (!/Duplicate key name/i.test(String(e.message))) throw e;
        }
    }
}

async function migrateListItemTable(conn) {
    const t = 'chotot_listing_list_item';
    if (!(await columnExists(conn, t, 'id'))) return;

    if (await columnExists(conn, t, 'value_text')) {
        if (await columnExists(conn, t, 'element_value')) {
            await conn.query(`UPDATE ${t} SET element_value = COALESCE(element_value, value_text)`);
            await conn.query(`ALTER TABLE ${t} DROP COLUMN value_text`);
        } else {
            await conn.query(`ALTER TABLE ${t} CHANGE COLUMN value_text element_value TEXT NULL`);
        }
    } else if (!(await columnExists(conn, t, 'element_value'))) {
        await conn.query(`ALTER TABLE ${t} ADD COLUMN element_value TEXT NULL`);
    }

    if (await columnExists(conn, t, 'sort_order')) {
        await conn.query(`ALTER TABLE ${t} DROP COLUMN sort_order`);
    }
}

async function migrateDropLegacyThumbnailTable(conn) {
    await conn.query('DROP TABLE IF EXISTS chotot_listing_image_thumbnail');
}

/**
 * Merge duplicate seller profile columns off listing into chotot_seller, then drop them from listing.
 * full_name / avatar / sold_ads are normalized to chotot_seller only (plan object seller_info).
 */
/** Drop legacy has_img_backup_ok on listing; API filter uses EXISTS on chotot_listing_image_backup. */
async function migrateDropListingHasImgBackupOkColumn(conn) {
    const [idx] = await conn.query(
        `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chotot_listing' AND INDEX_NAME = 'idx_has_backup' LIMIT 1`
    );
    if (idx.length) {
        await conn.query('ALTER TABLE chotot_listing DROP INDEX idx_has_backup');
    }
    if (await columnExists(conn, 'chotot_listing', 'has_img_backup_ok')) {
        await conn.query('ALTER TABLE chotot_listing DROP COLUMN has_img_backup_ok');
    }
}

async function ensureAlertRuleTable(conn) {
    await conn.query(`
    CREATE TABLE IF NOT EXISTS chotot_alert_rule (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      areas_json JSON NULL,
      wards_json JSON NULL,
      categories_json JSON NULL,
      price_min BIGINT NULL,
      price_max BIGINT NULL,
      company_mode VARCHAR(16) NOT NULL DEFAULT 'all',
      keyword VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    if (await columnExists(conn, 'chotot_alert_rule', 'cooldown_minutes')) {
        await conn.query('ALTER TABLE chotot_alert_rule DROP COLUMN cooldown_minutes');
    }
    if (await columnExists(conn, 'chotot_alert_rule', 'last_sent_at')) {
        await conn.query('ALTER TABLE chotot_alert_rule DROP COLUMN last_sent_at');
    }
}

async function migrateListingDedupSellerProfile(conn) {
    if (!(await columnExists(conn, 'chotot_listing', 'full_name'))) return;

    await conn.query(`
    INSERT INTO chotot_seller (account_oid, full_name, avatar, sold_ads, live_ads)
    SELECT l.account_oid, l.full_name, l.avatar, l.sold_ads, NULL
    FROM chotot_listing l
    WHERE l.account_oid IS NOT NULL AND l.account_oid != ''
    ON DUPLICATE KEY UPDATE
      full_name = COALESCE(chotot_seller.full_name, VALUES(full_name)),
      avatar = COALESCE(chotot_seller.avatar, VALUES(avatar)),
      sold_ads = COALESCE(chotot_seller.sold_ads, VALUES(sold_ads))
  `);

    for (const c of ['full_name', 'avatar', 'sold_ads']) {
        if (await columnExists(conn, 'chotot_listing', c)) {
            await conn.query(`ALTER TABLE chotot_listing DROP COLUMN \`${c}\``);
        }
    }
}

/**
 * Ensure schema, migrations to plan column names, backup index.
 */
export async function ensureSchema() {
    const p = getPool();
    if (!p) return;
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await p.query(sql);
    const conn = await p.getConnection();
    try {
        await migrateDropLegacyThumbnailTable(conn);
        await migrateListingRenames(conn);
        await migrateListingPlanColumns(conn);
        await migrateListingDedupSellerProfile(conn);
        await migrateMediaTable(conn);
        await migrateBackupTable(conn);
        await migrateListItemTable(conn);
        await migrateDropListingHasImgBackupOkColumn(conn);
        await ensureAlertRuleTable(conn);
    } finally {
        conn.release();
    }
}

function parseJsonList(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function normalizeRulePayload(input) {
    const areas = parseJsonList(input?.areas_json ?? input?.areas)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n));
    const wards = parseJsonList(input?.wards_json ?? input?.wards)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n));
    const categories = parseJsonList(input?.categories_json ?? input?.categories)
        .map((x) => String(x))
        .filter((s) => s === '1050' || s === '1020');
    const mode = String(input?.company_mode || 'all');
    return {
        name: String(input?.name || '').trim() || 'Alert rule',
        enabled: input?.enabled === false || input?.enabled === 0 ? 0 : 1,
        areas_json: JSON.stringify([...new Set(areas)]),
        wards_json: JSON.stringify([...new Set(wards)]),
        categories_json: JSON.stringify([...new Set(categories)]),
        price_min: input?.price_min != null && input?.price_min !== '' ? Number(input.price_min) : null,
        price_max: input?.price_max != null && input?.price_max !== '' ? Number(input.price_max) : null,
        company_mode: mode === 'agent' || mode === 'personal' ? mode : 'all',
        keyword: input?.keyword != null ? String(input.keyword).trim() : null
    };
}

function mapAlertRuleRow(row) {
    return {
        id: Number(row.id),
        name: row.name,
        enabled: row.enabled === 1,
        areas: parseJsonList(row.areas_json).map((x) => Number(x)).filter((n) => Number.isFinite(n)),
        wards: parseJsonList(row.wards_json).map((x) => Number(x)).filter((n) => Number.isFinite(n)),
        categories: parseJsonList(row.categories_json).map((x) => String(x)),
        price_min: row.price_min != null ? Number(row.price_min) : null,
        price_max: row.price_max != null ? Number(row.price_max) : null,
        company_mode: row.company_mode || 'all',
        keyword: row.keyword || ''
    };
}

export async function listAlertRules() {
    const p = getPool();
    if (!p) return [];
    const [rows] = await p.query('SELECT * FROM chotot_alert_rule ORDER BY id DESC');
    return rows.map(mapAlertRuleRow);
}

export async function getEnabledAlertRules() {
    const p = getPool();
    if (!p) return [];
    const [rows] = await p.query('SELECT * FROM chotot_alert_rule WHERE enabled = 1 ORDER BY id DESC');
    return rows.map(mapAlertRuleRow);
}

export async function createAlertRule(input) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    const n = normalizeRulePayload(input);
    const [r] = await p.execute(
        `INSERT INTO chotot_alert_rule
      (name, enabled, areas_json, wards_json, categories_json, price_min, price_max, company_mode, keyword)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            n.name,
            n.enabled,
            n.areas_json,
            n.wards_json,
            n.categories_json,
            n.price_min,
            n.price_max,
            n.company_mode,
            n.keyword || null
        ]
    );
    return Number(r.insertId);
}

export async function updateAlertRule(id, input) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    const n = normalizeRulePayload(input);
    await p.execute(
        `UPDATE chotot_alert_rule
     SET name = ?, enabled = ?, areas_json = ?, wards_json = ?, categories_json = ?, price_min = ?, price_max = ?, company_mode = ?, keyword = ?
     WHERE id = ?`,
        [
            n.name,
            n.enabled,
            n.areas_json,
            n.wards_json,
            n.categories_json,
            n.price_min,
            n.price_max,
            n.company_mode,
            n.keyword || null,
            Number(id)
        ]
    );
}

export async function deleteAlertRule(id) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    await p.execute('DELETE FROM chotot_alert_rule WHERE id = ?', [Number(id)]);
}

/** list_kind values = JSON array keys (plan). */
const LIST_ITEM_KINDS = [
    'ad_features',
    'ad_labels',
    'business_days',
    'fee_type',
    'inspection_images',
    'label_campaigns',
    'params',
    'pty_characteristics',
    'specific_service_offered'
];

function groupByAdId(rows) {
    const m = new Map();
    for (const r of rows) {
        const id = Number(r.ad_id);
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(r);
    }
    return m;
}

function parseShopFromRow(row) {
    const raw = row.shop_json;
    if (raw == null || raw === '') return undefined;
    if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return { ...raw };
    const s = typeof raw === 'string' ? raw : String(raw);
    try {
        return JSON.parse(s);
    } catch {
        return undefined;
    }
}

/**
 * Assemble: listing row + child rows + seller -> one flat ad (same shape as JSON file for app.js).
 */
function assembleFlatAd(row, mediaByAd, bakByAd, itemsByAd, sellerRow) {
    const id = Number(row.ad_id);
    const ad = {
        ad_id: id,
        list_id: row.list_id != null ? Number(row.list_id) : undefined,
        account_id: row.account_id != null ? Number(row.account_id) : undefined,
        account_oid: row.account_oid || undefined,
        category: row.category != null ? String(row.category) : undefined,
        region: row.region != null ? Number(row.region) : undefined,
        region_v2: row.region_v2 != null ? Number(row.region_v2) : undefined,
        area: row.area != null ? Number(row.area) : undefined,
        area_v2: row.area_v2 != null ? Number(row.area_v2) : undefined,
        ward: row.ward != null ? Number(row.ward) : undefined,
        company_ad: row.company_ad === 1,
        subject: row.subject || undefined,
        body: row.body || undefined,
        price: row.price != null ? Number(row.price) : undefined,
        price_string: row.price_string || undefined,
        deposit: row.deposit != null ? Number(row.deposit) : undefined,
        size: row.size != null ? Number(row.size) : undefined,
        size_unit_string: row.size_unit_string || undefined,
        list_time: row.list_time != null ? Number(row.list_time) : undefined,
        orig_list_time: row.orig_list_time != null ? Number(row.orig_list_time) : undefined,
        state: row.state || undefined,
        status: row.status || undefined,
        type: row.ad_type || undefined,
        account_name: row.account_name || undefined,
        full_name: sellerRow?.full_name || undefined,
        avatar: sellerRow?.avatar || undefined,
        category_name: row.category_name || undefined,
        area_name: row.area_name || undefined,
        region_name: row.region_name || undefined,
        region_name_v3: row.region_name_v3 || undefined,
        ward_name: row.ward_name || undefined,
        ward_name_v3: row.ward_name_v3 || undefined,
        longitude: row.longitude != null ? Number(row.longitude) : undefined,
        latitude: row.latitude != null ? Number(row.latitude) : undefined,
        location: row.location || undefined,
        street_number: row.street_number || undefined,
        street_name: row.street_name || undefined,
        streetnumber_display: row.street_number_display === 1,
        location_id: row.location_id || undefined,
        unique_street_id: row.unique_street_id || undefined,
        is_main_street: row.is_main_street === 1,
        contain_videos: row.contain_videos != null ? Number(row.contain_videos) : undefined,
        number_of_images: row.number_of_images != null ? Number(row.number_of_images) : undefined,
        furnishing_rent: row.furnishing_rent != null ? Number(row.furnishing_rent) : undefined,
        house_type: row.house_type != null ? Number(row.house_type) : undefined,
        floors: row.floors != null ? Number(row.floors) : undefined,
        direction: row.direction != null ? Number(row.direction) : undefined,
        detail_address: row.detail_address || undefined,
        furnishing_sell: row.furnishing_sell != null ? Number(row.furnishing_sell) : undefined,
        has_video: row.has_video === 1,
        sold_ads: sellerRow?.sold_ads != null ? Number(sellerRow.sold_ads) : undefined,
        total_rating: row.total_rating != null ? Number(row.total_rating) : undefined,
        total_rating_for_seller:
            row.total_rating_for_seller != null ? Number(row.total_rating_for_seller) : undefined,
        average_rating: row.average_rating != null ? Number(row.average_rating) : undefined,
        average_rating_for_seller:
            row.average_rating_for_seller != null ? Number(row.average_rating_for_seller) : undefined,
        is_sticky: row.is_sticky === 1,
        pty_jupiter: row.pty_jupiter != null ? Number(row.pty_jupiter) : undefined,
        pty_map: row.pty_map || undefined,
        pty_map_modifier: row.pty_map_modifier != null ? Number(row.pty_map_modifier) : undefined,
        pty_project_name: row.pty_project_name || undefined,
        price_million_per_m2: row.price_million_per_m2 != null ? Number(row.price_million_per_m2) : undefined,
        protection_entitlement: row.protection_entitlement === 1,
        is_zalo_show: row.is_zalo_show === 1,
        job_tier: row.job_tier != null ? Number(row.job_tier) : undefined,
        rooms: row.rooms != null ? Number(row.rooms) : undefined,
        toilets: row.toilets != null ? Number(row.toilets) : undefined,
        length: row.length != null ? Number(row.length) : undefined,
        width: row.width != null ? Number(row.width) : undefined,
        living_size: row.living_size != null ? Number(row.living_size) : undefined,
        property_legal_document:
            row.property_legal_document != null ? Number(row.property_legal_document) : undefined,
        block: row.block || undefined,
        is_good_room: row.is_good_room === 1,
        is_block_similar_ads_other_agent: row.is_block_similar_ads_other_agent === 1,
        project_oid: row.project_oid || undefined,
        projectid: row.project_id != null ? Number(row.project_id) : undefined,
        unitnumber: row.unit_number || undefined,
        unitnumber_display: row.unit_number_display === 1,
        shop_alias: row.shop_alias || undefined,
        special_display: row.special_display === 1,
        sticky_ad_type: row.sticky_ad_type || undefined,
        stickyad_feature: row.sticky_ad_feature || undefined,
        phone_hidden: row.phone_hidden != null && row.phone_hidden !== '' ? row.phone_hidden : undefined,
        phone: row.phone || undefined
    };

    const shop = parseShopFromRow(row);
    if (shop != null && Object.keys(shop).length) ad.shop = shop;

    ad.images = [];
    ad.videos = [];
    const media = mediaByAd.get(id);
    if (media && media.length) {
        const sorted = [...media].sort((a, b) => Number(a.id) - Number(b.id));
        ad.images = sorted.filter((m) => m.media_kind === 'image' && m.media_url).map((m) => m.media_url);
        ad.videos = sorted
            .filter((m) => m.media_kind === 'video')
            .map((m) => {
                const ext =
                    m.video_thumbnail_url ||
                    m.video_gif_url ||
                    (m.video_external_id != null && m.video_external_id !== '');
                if (ext) {
                    const o = {};
                    if (m.media_url) o.url = m.media_url;
                    if (m.video_thumbnail_url) o.thumbnail = m.video_thumbnail_url;
                    if (m.video_gif_url) o.gif_url = m.video_gif_url;
                    if (m.video_external_id != null) o.id = Number(m.video_external_id);
                    return o;
                }
                return m.media_url || undefined;
            })
            .filter((v) => v != null && v !== '');
    }

    ad.imgs_bak = [];
    const baks = bakByAd.get(id);
    if (baks && baks.length) {
        ad.imgs_bak = [...baks]
            .sort((a, b) => Number(a.id) - Number(b.id))
            .map((r) => ({
                src: r.backup_source_key,
                bak: r.backup_storage_ref,
                c: r.backup_cloud_name,
                s: r.backup_status
            }));
    }

    // Derived app field (not a listing column): same rule as plan — any imgs_bak row with s === 'ok'
    ad.has_img_backup_ok = ad.imgs_bak.some((x) => x && String(x.s) === 'ok');

    for (const k of LIST_ITEM_KINDS) {
        ad[k] = [];
    }
    const items = itemsByAd.get(id);
    if (items && items.length) {
        const byKind = new Map();
        const sortedItems = [...items].sort((a, b) => Number(a.id) - Number(b.id));
        for (const it of sortedItems) {
            if (!byKind.has(it.list_kind)) byKind.set(it.list_kind, []);
            let val = it.element_value;
            if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                try {
                    val = JSON.parse(val);
                } catch {
                    /* keep string */
                }
            }
            byKind.get(it.list_kind).push(val);
        }
        for (const [kind, arr] of byKind) {
            if (LIST_ITEM_KINDS.includes(kind)) ad[kind] = arr;
        }
    }

    if (row.account_oid && sellerRow) {
        const si = {};
        if (sellerRow.full_name) si.full_name = sellerRow.full_name;
        if (sellerRow.avatar) si.avatar = sellerRow.avatar;
        if (sellerRow.sold_ads != null) si.sold_ads = Number(sellerRow.sold_ads);
        if (sellerRow.live_ads != null) si.live_ads = Number(sellerRow.live_ads);
        if (Object.keys(si).length) ad.seller_info = si;
    }

    return ad;
}

/**
 * Replace child rows from ad (disassemble arrays into relational tables).
 */
export async function syncListingChildren(conn, ad) {
    const adId = Number(ad.ad_id);
    await conn.execute('DELETE FROM chotot_listing_media WHERE ad_id = ?', [adId]);
    await conn.execute('DELETE FROM chotot_listing_image_backup WHERE ad_id = ?', [adId]);
    await conn.execute('DELETE FROM chotot_listing_list_item WHERE ad_id = ?', [adId]);

    for (const u of ad.images || []) {
        if (typeof u === 'string' && u) {
            await conn.execute(
                'INSERT INTO chotot_listing_media (ad_id, media_kind, media_url) VALUES (?,?,?)',
                [adId, 'image', u]
            );
        }
    }
    for (const v of ad.videos || []) {
        if (typeof v === 'string' && v) {
            await conn.execute(
                'INSERT INTO chotot_listing_media (ad_id, media_kind, media_url) VALUES (?,?,?)',
                [adId, 'video', v]
            );
        } else if (v && typeof v === 'object') {
            const vid = v.id != null && Number.isFinite(Number(v.id)) ? Number(v.id) : null;
            await conn.execute(
                `INSERT INTO chotot_listing_media (ad_id, media_kind, media_url, video_thumbnail_url, video_gif_url, video_external_id)
         VALUES (?,?,?,?,?,?)`,
                [adId, 'video', v.url ?? null, v.thumbnail ?? null, v.gif_url ?? null, vid]
            );
        }
    }

    for (const row of ad.imgs_bak || []) {
        await conn.execute(
            `INSERT INTO chotot_listing_image_backup (ad_id, backup_source_key, backup_storage_ref, backup_cloud_name, backup_status)
       VALUES (?,?,?,?,?)`,
            [adId, row.src ?? null, row.bak ?? null, row.c ?? null, row.s ?? null]
        );
    }

    async function insertListItems(kind, arr) {
        if (!Array.isArray(arr)) return;
        for (const v of arr) {
            const text = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
            await conn.execute(
                'INSERT INTO chotot_listing_list_item (ad_id, list_kind, element_value) VALUES (?,?,?)',
                [adId, kind, text]
            );
        }
    }
    for (const kind of LIST_ITEM_KINDS) {
        await insertListItems(kind, ad[kind]);
    }
}

async function fetchChildrenMaps(p, adIds) {
    if (!adIds.length) {
        return {
            media: new Map(),
            bak: new Map(),
            items: new Map()
        };
    }
    const placeholders = adIds.map(() => '?').join(',');
    const [mediaRows] = await p.query(
        `SELECT id, ad_id, media_kind, media_url, video_thumbnail_url, video_gif_url, video_external_id
         FROM chotot_listing_media WHERE ad_id IN (${placeholders}) ORDER BY id ASC`,
        adIds
    );
    const [bakRows] = await p.query(
        `SELECT id, ad_id, backup_source_key, backup_storage_ref, backup_cloud_name, backup_status
         FROM chotot_listing_image_backup WHERE ad_id IN (${placeholders}) ORDER BY id ASC`,
        adIds
    );
    const [itemRows] = await p.query(
        `SELECT id, ad_id, list_kind, element_value
         FROM chotot_listing_list_item WHERE ad_id IN (${placeholders}) ORDER BY id ASC`,
        adIds
    );
    return {
        media: groupByAdId(mediaRows),
        bak: groupByAdId(bakRows),
        items: groupByAdId(itemRows)
    };
}

async function fetchSellersMap(p, accountOids) {
    const unique = [...new Set(accountOids.filter(Boolean).map(String))];
    if (!unique.length) return new Map();
    const ph = unique.map(() => '?').join(',');
    const [rows] = await p.query(
        `SELECT account_oid, full_name, avatar, sold_ads, live_ads FROM chotot_seller WHERE account_oid IN (${ph})`,
        unique
    );
    const m = new Map();
    for (const r of rows) m.set(String(r.account_oid), r);
    return m;
}

async function assembleAdsFromListingRows(p, rows) {
    const ids = rows.map((r) => Number(r.ad_id));
    const { media, bak, items } = await fetchChildrenMaps(p, ids);
    const sellerMap = await fetchSellersMap(
        p,
        rows.map((r) => r.account_oid)
    );
    return rows.map((r) =>
        assembleFlatAd(r, media, bak, items, r.account_oid ? sellerMap.get(String(r.account_oid)) : null)
    );
}

async function upsertSeller(conn, ad) {
    const oid = ad.account_oid != null && ad.account_oid !== '' ? String(ad.account_oid) : null;
    if (!oid) return;
    const si = ad.seller_info || {};
    const fullName =
        si.full_name != null
            ? String(si.full_name)
            : si.name != null
              ? String(si.name)
              : ad.full_name != null
                ? String(ad.full_name)
                : null;
    const avatar = si.avatar != null ? String(si.avatar) : ad.avatar != null ? String(ad.avatar) : null;
    const sold = si.sold_ads != null ? Number(si.sold_ads) : ad.sold_ads != null ? Number(ad.sold_ads) : null;
    const live = si.live_ads != null ? Number(si.live_ads) : null;
    await conn.execute(
        `INSERT INTO chotot_seller (account_oid, full_name, avatar, sold_ads, live_ads)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       full_name = COALESCE(VALUES(full_name), full_name),
       avatar = COALESCE(VALUES(avatar), avatar),
       sold_ads = COALESCE(VALUES(sold_ads), sold_ads),
       live_ads = COALESCE(VALUES(live_ads), live_ads)`,
        [oid, fullName, avatar, sold, live]
    );
}

const INSERT_LISTING_COLS = [
    'ad_id',
    'list_id',
    'account_id',
    'account_oid',
    'region',
    'region_v2',
    'area',
    'area_v2',
    'ward',
    'category',
    'category_name',
    'company_ad',
    'subject',
    'body',
    'price',
    'price_string',
    'deposit',
    'size',
    'size_unit_string',
    'list_time',
    'orig_list_time',
    'state',
    'status',
    'ad_type',
    'account_name',
    'longitude',
    'latitude',
    'location',
    'street_number',
    'street_name',
    'street_number_display',
    'location_id',
    'unique_street_id',
    'is_main_street',
    'contain_videos',
    'number_of_images',
    'pty_jupiter',
    'pty_map',
    'pty_map_modifier',
    'pty_project_name',
    'price_million_per_m2',
    'protection_entitlement',
    'is_sticky',
    'is_zalo_show',
    'job_tier',
    'furnishing_rent',
    'furnishing_sell',
    'has_video',
    'house_type',
    'floors',
    'direction',
    'detail_address',
    'rooms',
    'toilets',
    'length',
    'width',
    'living_size',
    'property_legal_document',
    'block',
    'is_good_room',
    'is_block_similar_ads_other_agent',
    'project_oid',
    'project_id',
    'unit_number',
    'unit_number_display',
    'shop_alias',
    'shop_json',
    'special_display',
    'sticky_ad_type',
    'sticky_ad_feature',
    'total_rating',
    'total_rating_for_seller',
    'average_rating',
    'average_rating_for_seller',
    'phone',
    'phone_hidden',
    'region_name',
    'region_name_v3',
    'area_name',
    'ward_name',
    'ward_name_v3'
];

const LISTING_SELECT_COLS = INSERT_LISTING_COLS.map((c) => `\`${c}\``).join(', ');
const LISTING_SELECT_COLS_ALIAS_L = INSERT_LISTING_COLS.map((c) => `l.\`${c}\``).join(', ');

function insertListingPlaceholders() {
    return `(${INSERT_LISTING_COLS.map(() => '?').join(',')})`;
}

function listingValuesArray(s) {
    return INSERT_LISTING_COLS.map((k) => s[k]);
}

/**
 * Upsert one listing row + seller/phone + child tables (media, backup, list_item) on an open connection.
 */
async function upsertListingRowAndChildren(conn, ad, areaV2, categoryNum) {
    await upsertSeller(conn, ad);
    await insertIgnoreSellerPhone(conn, ad);
    const s = listingScalarsFromAd(ad, areaV2, categoryNum);
    const adId = s.ad_id;
    const [exists] = await conn.execute('SELECT 1 FROM chotot_listing WHERE ad_id = ? LIMIT 1', [adId]);
    if (!exists.length) {
        const sql = `INSERT INTO chotot_listing (${INSERT_LISTING_COLS.join(',')}) VALUES ${insertListingPlaceholders()}`;
        await conn.execute(sql, listingValuesArray(s));
    } else {
        const sets = INSERT_LISTING_COLS.filter((c) => c !== 'ad_id')
            .map((c) => `\`${c}\` = ?`)
            .join(', ');
        const vals = INSERT_LISTING_COLS.filter((c) => c !== 'ad_id').map((k) => s[k]);
        vals.push(adId);
        await conn.execute(`UPDATE chotot_listing SET ${sets} WHERE ad_id = ?`, vals);
    }
    await syncListingChildren(conn, ad);
}

function getListingTimeScore(adLike) {
    const t1 = Number(adLike?.list_time);
    const t2 = Number(adLike?.orig_list_time);
    const a = Number.isFinite(t1) ? t1 : 0;
    const b = Number.isFinite(t2) ? t2 : 0;
    return Math.max(a, b);
}

/**
 * Load assembled ads by primary keys only (no full-area scan of wide rows in one query).
 */
export async function getListingsByAdIds(adIds) {
    const p = getPool();
    if (!p || !adIds?.length) return [];
    const ids = [...new Set(adIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!ids.length) return [];
    const ph = ids.map(() => '?').join(',');
    const [rows] = await p.execute(`SELECT ${LISTING_SELECT_COLS} FROM chotot_listing WHERE ad_id IN (${ph})`, ids);
    return assembleAdsFromListingRows(p, rows);
}

/** Chunk size when re-hydrating listings after a lightweight ad_id listing scan. */
const AREA_ASSEMBLE_CHUNK = 300;

/**
 * List ad_id for an area+category, then assemble ads in chunks (WHERE IN).
 */
export async function loadAssembledListingsByAreaCategory(areaV2, categoryNum) {
    const p = getPool();
    if (!p) return [];
    const [idRows] = await p.execute(
        'SELECT ad_id FROM chotot_listing WHERE area_v2 = ? AND category = ? ORDER BY ad_id',
        [areaV2, categoryNum]
    );
    const allIds = idRows.map((r) => Number(r.ad_id));
    const out = [];
    for (let i = 0; i < allIds.length; i += AREA_ASSEMBLE_CHUNK) {
        const chunk = allIds.slice(i, i + AREA_ASSEMBLE_CHUNK);
        const part = await getListingsByAdIds(chunk);
        out.push(...part);
    }
    return out;
}

/**
 * Crawl write path: upsert only ads in this batch (no DELETE whole area+category).
 */
export async function upsertListingsForCrawl(areaV2, categoryNum, ads) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    if (!ads?.length) return;
    const conn = await p.getConnection();
    try {
        await conn.beginTransaction();
        for (const ad of ads) {
            await upsertListingRowAndChildren(conn, ad, areaV2, categoryNum);
        }
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/**
 * Import write path: upsert by ad_id, but only when incoming listing is newer.
 * "Newer" is defined as max(list_time, orig_list_time).
 * This avoids deleting and prevents older area snapshots from overwriting newer data.
 */
export async function upsertListingsForImport(areaV2, categoryNum, ads) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    if (!ads?.length) return { processed: 0, inserted: 0, updated: 0, skipped: 0 };

    const normalized = (ads || []).filter((a) => a && typeof a === 'object');
    const adIds = [...new Set(
        normalized
            .map((a) => Number(a.ad_id))
            .filter((n) => Number.isFinite(n) && n > 0)
    )];

    const existingScoreById = new Map();
    const CHUNK = 800;
    for (let i = 0; i < adIds.length; i += CHUNK) {
        const chunk = adIds.slice(i, i + CHUNK);
        const ph = chunk.map(() => '?').join(',');
        const [rows] = await p.execute(
            `SELECT ad_id, list_time, orig_list_time FROM chotot_listing WHERE ad_id IN (${ph})`,
            chunk
        );
        for (const r of rows) {
            existingScoreById.set(Number(r.ad_id), getListingTimeScore(r));
        }
    }

    const conn = await p.getConnection();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    try {
        await conn.beginTransaction();
        for (const ad of normalized) {
            const id = Number(ad.ad_id);
            if (!Number.isFinite(id) || id <= 0) continue;

            const incomingScore = getListingTimeScore(ad);
            const existingScore = existingScoreById.get(id) ?? null;

            // If existing row is newer or equal, skip this import record.
            if (existingScore != null && existingScore >= incomingScore) {
                skipped += 1;
                continue;
            }

            const [exists] = await conn.execute('SELECT 1 FROM chotot_listing WHERE ad_id = ? LIMIT 1', [id]);
            await upsertListingRowAndChildren(conn, ad, areaV2, categoryNum);
            if (!exists.length) inserted += 1;
            else updated += 1;
        }
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }

    return { processed: normalized.length, inserted, updated, skipped };
}

/**
 * Replace all listings for one area + category (matches one JSON file snapshot).
 * Prefer for one-shot import; crawl should use upsertListingsForCrawl instead.
 */
export async function replaceAreaCategoryListings(areaV2, categoryNum, ads) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    const conn = await p.getConnection();
    try {
        await conn.beginTransaction();
        await conn.execute('DELETE FROM chotot_listing WHERE area_v2 = ? AND category = ?', [areaV2, categoryNum]);
        const sql = `INSERT INTO chotot_listing (${INSERT_LISTING_COLS.join(',')}) VALUES ${insertListingPlaceholders()}`;
        for (const ad of ads) {
            await upsertSeller(conn, ad);
            const s = listingScalarsFromAd(ad, areaV2, categoryNum);
            await conn.execute(sql, listingValuesArray(s));
            await insertIgnoreSellerPhone(conn, ad);
            await syncListingChildren(conn, ad);
        }
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/** Minimum length for server-side search (LIKE) — plan Phần 4. */
const MIN_SEARCH_LEN = 2;
const LIST_MAX_LIMIT = 100;

/** Escape % and _ for LIKE patterns (MySQL default escape). */
function escapeLikePattern(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Build WHERE + JOIN for filtered listing queries (indexed filters first; LIKE only for search_q).
 */
function buildAdsFilterClause(filters) {
    const parts = ['1=1'];
    const params = [];
    let joinSeller = false;

    if (filters.category && filters.category !== 'all') {
        const cat = parseInt(String(filters.category), 10);
        if (!Number.isNaN(cat)) {
            parts.push('l.category = ?');
            params.push(cat);
        }
    }
    if (filters.onlyBackup) {
        parts.push(
            'EXISTS (SELECT 1 FROM chotot_listing_image_backup b WHERE b.ad_id = l.ad_id AND b.backup_status = ?)'
        );
        params.push('ok');
    }
    if (filters.area_v2 != null && Number.isFinite(Number(filters.area_v2))) {
        parts.push('l.area_v2 = ?');
        params.push(Number(filters.area_v2));
    }
    if (filters.wards?.length) {
        const ph = filters.wards.map(() => '?').join(',');
        parts.push(`l.ward IN (${ph})`);
        params.push(...filters.wards.map((w) => Number(w)));
    }
    if (filters.price_min != null && Number.isFinite(Number(filters.price_min))) {
        parts.push('l.price >= ?');
        params.push(Number(filters.price_min));
    }
    if (filters.price_max != null && Number.isFinite(Number(filters.price_max))) {
        parts.push('l.price <= ?');
        params.push(Number(filters.price_max));
    }
    if (filters.company === 'agent') {
        parts.push('l.company_ad = 1');
    } else if (filters.company === 'personal') {
        parts.push('l.company_ad = 0');
    }

    const q = (filters.search_q || '').trim();
    if (q.length >= MIN_SEARCH_LEN) {
        joinSeller = true;
        const pat = `%${escapeLikePattern(q)}%`;
        parts.push(
            '(l.subject LIKE ? OR l.body LIKE ? OR l.price_string LIKE ? OR l.account_name LIKE ? OR l.area_name LIKE ? OR l.ward_name LIKE ? OR l.street_name LIKE ? OR l.street_number LIKE ? OR s.full_name LIKE ?)'
        );
        for (let i = 0; i < 9; i++) params.push(pat);
    }

    const joinSql = joinSeller ? 'LEFT JOIN chotot_seller s ON s.account_oid = l.account_oid' : '';
    const whereSql = parts.join(' AND ');
    return { joinSql, whereSql, params };
}

function orderSqlForSort(sort) {
    switch (sort) {
        case 'price-asc':
            return 'l.price ASC, l.ad_id DESC';
        case 'price-desc':
            return 'l.price DESC, l.ad_id DESC';
        case 'oldest':
            return 'l.list_time ASC, l.ad_id ASC';
        case 'newest':
        default:
            return 'l.list_time DESC, l.ad_id DESC';
    }
}

/**
 * Slim payload for list cards + map popup links (full detail via GET /api/ads/:id).
 */
export function toAdListItemDto(ad) {
    const backupImg = ad.imgs_bak?.find((x) => x && String(x.s) === 'ok');
    const okBackups = (ad.imgs_bak || [])
        .filter((x) => x && String(x.s) === 'ok' && x.bak && x.c)
        .slice(0, 12)
        .map((x) => ({ src: x.src, bak: x.bak, c: x.c, s: x.s }));
    let body_preview;
    if (ad.body && typeof ad.body === 'string') {
        body_preview = ad.body.length > 80 ? `${ad.body.slice(0, 80)}...` : ad.body;
    }
    return {
        ad_id: ad.ad_id,
        list_id: ad.list_id,
        account_id: ad.account_id,
        account_oid: ad.account_oid,
        category: ad.category,
        subject: ad.subject,
        price: ad.price,
        price_string: ad.price_string,
        company_ad: ad.company_ad,
        list_time: ad.list_time,
        area_v2: ad.area_v2,
        area: ad.area,
        ward: ad.ward,
        street_number: ad.street_number,
        street_name: ad.street_name,
        ward_name: ad.ward_name,
        area_name: ad.area_name,
        size: ad.size,
        phone: ad.phone,
        account_name: ad.account_name,
        full_name: ad.full_name,
        number_of_images: ad.number_of_images,
        location: ad.location,
        images: ad.images?.length ? [ad.images[0]] : [],
        imgs_bak: okBackups,
        has_img_backup_ok: Boolean(ad.has_img_backup_ok),
        thumb_backup: backupImg ? { bak: backupImg.bak, c: backupImg.c, s: backupImg.s } : undefined,
        body_preview: body_preview || undefined
    };
}

function toMapPointDto(row) {
    return {
        ad_id: Number(row.ad_id),
        subject: row.subject || undefined,
        price_string: row.price_string || undefined,
        category: row.category != null ? String(row.category) : undefined,
        company_ad: row.company_ad === 1,
        phone: row.phone || undefined,
        location: row.location || undefined,
        latitude: row.latitude != null ? Number(row.latitude) : undefined,
        longitude: row.longitude != null ? Number(row.longitude) : undefined,
        price: row.price != null ? Number(row.price) : undefined
    };
}

/**
 * Count listings matching filters (same WHERE as list/map).
 */
export async function countAdsFiltered(filters) {
    const p = getPool();
    if (!p) return 0;
    const { joinSql, whereSql, params } = buildAdsFilterClause(filters);
    const sql = `SELECT COUNT(*) AS c FROM chotot_listing l ${joinSql} WHERE ${whereSql}`;
    const [rows] = await p.execute(sql, params);
    return rows[0]?.c != null ? Number(rows[0].c) : 0;
}

/**
 * Paginated list: assemble full rows then map to list DTO (bounded by limit per request).
 */
export async function queryAdsListV2(filters) {
    const p = getPool();
    if (!p) return { items: [], total: 0, offset: 0, limit: 0, has_more: false };
    const limit = Math.min(LIST_MAX_LIMIT, Math.max(1, Number(filters.limit) || 30));
    const offset = Math.max(0, Number(filters.offset) || 0);
    const { joinSql, whereSql, params } = buildAdsFilterClause(filters);
    const orderBy = orderSqlForSort(filters.sort);
    const sql = `SELECT ${LISTING_SELECT_COLS_ALIAS_L} FROM chotot_listing l ${joinSql} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const execParams = [...params, limit + 1, offset];
    const [rows] = await p.execute(sql, execParams);
    const has_more = rows.length > limit;
    const slice = has_more ? rows.slice(0, limit) : rows;
    // COUNT only on first page to avoid extra full scan on every scroll chunk.
    const total = offset === 0 ? await countAdsFiltered(filters) : undefined;
    const assembled = await assembleAdsFromListingRows(p, slice);
    const items = assembled.map(toAdListItemDto);
    return {
        items,
        total,
        offset,
        limit,
        has_more
    };
}

/**
 * Lightweight points for Leaflet (same filters; returns all matched rows).
 */
export async function queryMapPointsV2(filters) {
    const p = getPool();
    if (!p) return { items: [] };
    const { joinSql, whereSql, params } = buildAdsFilterClause(filters);
    const orderBy = orderSqlForSort(filters.sort);
    const sql = `SELECT l.ad_id, l.subject, l.price_string, l.price,
    l.category, l.company_ad, l.phone,
    l.location, l.latitude, l.longitude
    FROM chotot_listing l ${joinSql} WHERE ${whereSql} ORDER BY ${orderBy}`;
    const [rows] = await p.execute(sql, params);
    return { items: rows.map(toMapPointDto) };
}

/**
 * Parse URL query into filter object for V2 list/map APIs.
 */
export function parseAdsFilterFromQuery(q) {
    const wardsRaw = q.wards ?? q.ward;
    let wards = [];
    if (wardsRaw != null) {
        if (Array.isArray(wardsRaw)) {
            wards = wardsRaw.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n));
        } else {
            wards = String(wardsRaw)
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => Number.isFinite(n));
        }
    }
    const pm = q.price_min;
    const px = q.price_max;
    const out = {
        category: q.category || 'all',
        onlyBackup: q.only_backup === 'true',
        area_v2: q.area_v2 != null && q.area_v2 !== '' ? parseInt(String(q.area_v2), 10) : null,
        wards,
        price_min: pm != null && pm !== '' ? Number(pm) : null,
        price_max: px != null && px !== '' ? Number(px) : null,
        company: q.company || 'all',
        search_q: (q.q || '').trim(),
        sort: q.sort || 'newest',
        offset: parseInt(String(q.offset || '0'), 10) || 0,
        limit: parseInt(String(q.limit || '40'), 10) || 40
    };
    if (out.sort === 'price_asc') out.sort = 'price-asc';
    if (out.sort === 'price_desc') out.sort = 'price-desc';
    const allowedSort = new Set(['newest', 'oldest', 'price-asc', 'price-desc']);
    if (!allowedSort.has(out.sort)) out.sort = 'newest';
    if (!['all', 'personal', 'agent'].includes(out.company)) out.company = 'all';
    return out;
}

/**
 * Upsert region/area/ward hierarchy into relational tables.
 * Input supports Chotot loadRegions payload shape.
 */
export async function upsertRegionTreeFromPayload(payload, rootRegionId = 13000) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    const root = payload?.regionFollowId?.entities?.regions?.[String(rootRegionId)];
    if (!root) throw new Error(`Region ${rootRegionId} not found in payload`);
    const conn = await p.getConnection();
    try {
        await conn.beginTransaction();
        await conn.execute(
            `INSERT INTO chotot_region (region_v2, region_name) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE region_name = VALUES(region_name)`,
            [Number(rootRegionId), String(root.name || `Region ${rootRegionId}`)]
        );
        const areasObj = root.area || {};
        const areaIds = Object.keys(areasObj);
        for (const areaIdRaw of areaIds) {
            const areaId = Number(areaIdRaw);
            const area = areasObj[areaIdRaw] || {};
            await conn.execute(
                `INSERT INTO chotot_area (area_v2, region_v2, area_name) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE region_v2 = VALUES(region_v2), area_name = VALUES(area_name)`,
                [areaId, Number(rootRegionId), String(area.name || `Area ${areaId}`)]
            );
            const wards = Array.isArray(area.wards) ? area.wards : [];
            for (const w of wards) {
                const wardId = Number(w?.value ?? w?.ward ?? w?.id);
                if (!Number.isFinite(wardId)) continue;
                await conn.execute(
                    `INSERT INTO chotot_ward (ward_id, area_v2, ward_name) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE area_v2 = VALUES(area_v2), ward_name = VALUES(ward_name)`,
                    [wardId, areaId, String(w?.name ?? `Ward ${wardId}`)]
                );
            }
        }
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/**
 * Region tree for filter UI.
 */
export async function getRegionTree(regionId = 13000) {
    const p = getPool();
    if (!p) return { region: null, areas: [] };
    const [regions] = await p.execute(
        'SELECT region_v2, region_name FROM chotot_region WHERE region_v2 = ? LIMIT 1',
        [Number(regionId)]
    );
    if (!regions.length) {
        return { region: null, areas: [] };
    }
    const [areas] = await p.execute(
        'SELECT area_v2, area_name FROM chotot_area WHERE region_v2 = ? ORDER BY area_name ASC',
        [Number(regionId)]
    );
    const areaIds = areas.map((a) => Number(a.area_v2));
    let wards = [];
    if (areaIds.length) {
        const ph = areaIds.map(() => '?').join(',');
        const [rows] = await p.execute(
            `SELECT ward_id, area_v2, ward_name FROM chotot_ward WHERE area_v2 IN (${ph}) ORDER BY ward_name ASC`,
            areaIds
        );
        wards = rows;
    }
    const wardsByArea = new Map();
    for (const w of wards) {
        const aid = Number(w.area_v2);
        if (!wardsByArea.has(aid)) wardsByArea.set(aid, []);
        wardsByArea.get(aid).push({
            ward_id: Number(w.ward_id),
            ward_name: w.ward_name
        });
    }
    return {
        region: {
            region_v2: Number(regions[0].region_v2),
            region_name: regions[0].region_name
        },
        areas: areas.map((a) => ({
            area_v2: Number(a.area_v2),
            area_name: a.area_name,
            wards: wardsByArea.get(Number(a.area_v2)) || []
        }))
    };
}

/**
 * Load all assembled listings for one area+category in one query (can be large).
 * Crawl merge uses getListingsByAdIds; backup phase uses loadAssembledListingsByAreaCategory (chunked).
 */
export async function loadListingsByAreaCategory(areaV2, categoryNum) {
    const p = getPool();
    if (!p) return [];
    const [rows] = await p.execute(`SELECT ${LISTING_SELECT_COLS} FROM chotot_listing WHERE area_v2 = ? AND category = ?`, [
        areaV2,
        categoryNum
    ]);
    return assembleAdsFromListingRows(p, rows);
}

/**
 * API: flat ads; onlyBackup => at least one backup row with backup_status = 'ok' (no redundant flag column on listing).
 */
export async function getListingsForApi(categoryFilter, onlyBackup = false) {
    const p = getPool();
    if (!p) return [];
    let sql = `SELECT ${LISTING_SELECT_COLS} FROM chotot_listing WHERE 1=1`;
    const params = [];
    if (categoryFilter !== 'all') {
        const cat = parseInt(categoryFilter, 10);
        if (Number.isNaN(cat)) return [];
        sql += ' AND category = ?';
        params.push(cat);
    }
    if (onlyBackup) {
        sql +=
            ' AND EXISTS (SELECT 1 FROM chotot_listing_image_backup b WHERE b.ad_id = chotot_listing.ad_id AND b.backup_status = ?)';
        params.push('ok');
    }
    sql += ' ORDER BY list_time DESC';
    const [rows] = await p.execute(sql, params);
    return assembleAdsFromListingRows(p, rows);
}

export async function getSellerPhones(accountOid) {
    const p = getPool();
    if (!p) return [];
    const oid = String(accountOid || '');
    if (!oid) return [];
    const [rows] = await p.execute(
        'SELECT phone, source_ad_id FROM chotot_seller_phone WHERE account_oid = ? ORDER BY phone',
        [oid]
    );
    return rows.map((r) => ({ phone: r.phone, source_ad_id: r.source_ad_id }));
}

export async function getSellerProfile(accountOid) {
    const p = getPool();
    if (!p) return { seller: null, phones: [], listings: [] };
    const oid = String(accountOid || '').trim();
    if (!oid) return { seller: null, phones: [], listings: [] };

    const [sellerRows] = await p.execute(
        `SELECT account_oid, full_name, avatar, sold_ads, live_ads
         FROM chotot_seller
         WHERE account_oid = ?
         LIMIT 1`,
        [oid]
    );
    const seller = sellerRows[0] || null;

    const [phoneRows] = await p.execute(
        `SELECT phone, source_ad_id
         FROM chotot_seller_phone
         WHERE account_oid = ?
         ORDER BY phone ASC`,
        [oid]
    );
    const phones = phoneRows.map((r) => ({
        phone: r.phone,
        source_ad_id: r.source_ad_id
    }));

    const [listingRows] = await p.execute(
        `SELECT ${LISTING_SELECT_COLS}
         FROM chotot_listing
         WHERE account_oid = ?
         ORDER BY list_time DESC, ad_id DESC`,
        [oid]
    );
    const assembled = await assembleAdsFromListingRows(p, listingRows);
    const listings = assembled.map(toAdListItemDto);

    return { seller, phones, listings };
}

export async function getSellerPhoneSourceAdIds(accountOid) {
    const p = getPool();
    if (!p) return [];
    const oid = String(accountOid || '');
    if (!oid) return [];
    const [rows] = await p.execute(
        'SELECT DISTINCT source_ad_id FROM chotot_seller_phone WHERE account_oid = ? AND source_ad_id IS NOT NULL',
        [oid]
    );
    return rows
        .map((r) => Number(r.source_ad_id))
        .filter((n) => Number.isFinite(n) && n > 0);
}

export async function upsertSellerPhones(accountOid, entries) {
    const p = getPool();
    if (!p) return 0;
    const oid = String(accountOid || '');
    if (!oid || !Array.isArray(entries) || !entries.length) return 0;
    const conn = await p.getConnection();
    let inserted = 0;
    try {
        for (const e of entries) {
            const phone = e?.phone != null ? String(e.phone).trim() : '';
            if (!phone) continue;
            const sourceAdId = e?.source_ad_id != null && Number.isFinite(Number(e.source_ad_id))
                ? Number(e.source_ad_id)
                : null;
            const [r] = await conn.execute(
                'INSERT IGNORE INTO chotot_seller_phone (account_oid, phone, source_ad_id) VALUES (?, ?, ?)',
                [oid, phone, sourceAdId]
            );
            inserted += Number(r?.affectedRows || 0);
        }
    } finally {
        conn.release();
    }
    return inserted;
}

export async function getListingByAdId(adId) {
    const p = getPool();
    if (!p) return null;
    const [rows] = await p.execute(`SELECT ${LISTING_SELECT_COLS} FROM chotot_listing WHERE ad_id = ? LIMIT 1`, [
        Number(adId)
    ]);
    if (!rows.length) return null;
    const [ad] = await assembleAdsFromListingRows(p, rows);
    return ad;
}

/**
 * Insert or update listing + children (backup API, manual fixes, post-backup persist).
 */
export async function saveListingPayload(ad) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    const adId = Number(ad.ad_id);
    let areaV2 = ad.area_v2 != null ? Number(ad.area_v2) : null;
    let categoryNum = ad.category != null ? parseInt(String(ad.category), 10) : null;
    if (areaV2 == null || Number.isNaN(categoryNum)) {
        const [rows] = await p.execute('SELECT area_v2, category FROM chotot_listing WHERE ad_id = ? LIMIT 1', [
            adId
        ]);
        if (rows.length) {
            areaV2 = Number(rows[0].area_v2);
            categoryNum = Number(rows[0].category);
        }
    }
    if (areaV2 == null || Number.isNaN(categoryNum)) {
        throw new Error('saveListingPayload: need area_v2 and category on ad or existing listing row');
    }
    const conn = await p.getConnection();
    try {
        await upsertListingRowAndChildren(conn, ad, areaV2, categoryNum);
    } finally {
        conn.release();
    }
}

export async function getAllListingPayloadsForBatch() {
    const p = getPool();
    if (!p) return [];
    const [rows] = await p.execute(`SELECT ${LISTING_SELECT_COLS} FROM chotot_listing WHERE company_ad = 0`);
    return assembleAdsFromListingRows(p, rows);
}

async function insertIgnoreSellerPhone(conn, ad) {
    const oid = ad.account_oid != null && ad.account_oid !== '' ? String(ad.account_oid) : null;
    const phone = ad.phone != null && ad.phone !== '' ? String(ad.phone) : null;
    if (!oid || !phone) return;
    const adId = ad.ad_id != null ? Number(ad.ad_id) : null;
    await conn.execute(`INSERT IGNORE INTO chotot_seller_phone (account_oid, phone, source_ad_id) VALUES (?, ?, ?)`, [
        oid,
        phone,
        adId
    ]);
}

export async function createSqlBackupFile(outputPath) {
    const p = getPool();
    if (!p) throw new Error('MySQL not configured');
    const host = process.env.MYSQL_HOST || '127.0.0.1';
    const port = process.env.MYSQL_PORT ? String(process.env.MYSQL_PORT) : '3306';
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE;
    if (!database) throw new Error('MYSQL_DATABASE is required for mysqldump');

    const mysqldumpBin = process.env.MYSQLDUMP_PATH || 'mysqldump';
    const args = [
        '--single-transaction',
        '--skip-lock-tables',
        '--default-character-set=utf8mb4',
        '--host',
        host,
        '--port',
        port,
        '--user',
        user,
        database
    ];

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(outputPath, { encoding: 'utf8' });
        const child = spawn(mysqldumpBin, args, {
            env: {
                ...process.env,
                MYSQL_PWD: password
            },
            windowsHide: true
        });

        let stderr = '';
        child.stdout.pipe(out);
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        child.on('error', (err) => {
            out.close(() => reject(new Error(`Failed to start mysqldump: ${err.message}`)));
        });
        child.on('close', (code) => {
            out.close(() => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(`mysqldump exited with code ${code}: ${stderr.trim()}`));
            });
        });
    });
}

export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
