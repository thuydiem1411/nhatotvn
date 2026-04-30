-- Chotot MySQL: ERD plan (relational only; no payload blob on listing).
-- Tables: chotot_seller, chotot_seller_phone, chotot_listing, chotot_listing_media,
--         chotot_listing_image_backup, chotot_listing_list_item.
-- Controlled normalization (see plan: not full textbook 5NF on whole listing):
--   - No duplicate seller profile on listing: full_name, avatar, sold_ads only on chotot_seller.
--   - No stored has_img_backup_ok; derive from chotot_listing_image_backup (backup_status = 'ok') or at assemble.
--   - shop_json is an intentional exception (non-atomic subtree per plan).
-- Child row order: ORDER BY id (no sort_order). See chototMysql.js for legacy migrations.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS chotot_seller (
  account_oid VARCHAR(64) NOT NULL PRIMARY KEY,
  full_name VARCHAR(512) NULL,
  avatar VARCHAR(1024) NULL,
  sold_ads INT NULL,
  live_ads INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_region (
  region_v2 INT NOT NULL PRIMARY KEY,
  region_name VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_area (
  area_v2 INT NOT NULL PRIMARY KEY,
  region_v2 INT NOT NULL,
  area_name VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_area_region (region_v2),
  CONSTRAINT fk_area_region FOREIGN KEY (region_v2) REFERENCES chotot_region (region_v2) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_ward (
  ward_id INT NOT NULL PRIMARY KEY,
  area_v2 INT NOT NULL,
  ward_name VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ward_area (area_v2),
  CONSTRAINT fk_ward_area FOREIGN KEY (area_v2) REFERENCES chotot_area (area_v2) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_listing (
  ad_id BIGINT NOT NULL PRIMARY KEY,
  list_id BIGINT NOT NULL,
  account_id BIGINT NULL,
  account_oid VARCHAR(64) NULL,
  region INT NULL,
  region_v2 INT NULL,
  area INT NULL,
  area_v2 INT NOT NULL,
  ward INT NULL,
  category SMALLINT NOT NULL,
  category_name VARCHAR(255) NULL,
  company_ad TINYINT(1) NOT NULL DEFAULT 0,
  subject VARCHAR(512) NULL,
  body MEDIUMTEXT NULL,
  price BIGINT NULL,
  price_string VARCHAR(255) NULL,
  deposit BIGINT NULL,
  size INT NULL,
  size_unit_string VARCHAR(32) NULL,
  list_time BIGINT NULL,
  orig_list_time BIGINT NULL,
  state VARCHAR(64) NULL,
  status VARCHAR(64) NULL,
  ad_type VARCHAR(16) NULL,
  account_name VARCHAR(512) NULL,
  longitude DOUBLE NULL,
  latitude DOUBLE NULL,
  location VARCHAR(255) NULL,
  street_number VARCHAR(512) NULL,
  street_name VARCHAR(512) NULL,
  street_number_display TINYINT(1) NULL,
  location_id VARCHAR(255) NULL,
  unique_street_id VARCHAR(128) NULL,
  is_main_street TINYINT(1) NULL,
  contain_videos INT NULL,
  number_of_images SMALLINT NULL,
  pty_jupiter INT NULL,
  pty_map VARCHAR(2048) NULL,
  pty_map_modifier DOUBLE NULL,
  pty_project_name VARCHAR(512) NULL,
  price_million_per_m2 DOUBLE NULL,
  protection_entitlement TINYINT(1) NULL,
  is_sticky TINYINT(1) NULL,
  is_zalo_show TINYINT(1) NULL,
  job_tier INT NULL,
  furnishing_rent SMALLINT NULL,
  furnishing_sell SMALLINT NULL,
  has_video TINYINT(1) NULL,
  house_type SMALLINT NULL,
  floors SMALLINT NULL,
  direction SMALLINT NULL,
  detail_address VARCHAR(512) NULL,
  rooms INT NULL,
  toilets INT NULL,
  length INT NULL,
  width INT NULL,
  living_size INT NULL,
  property_legal_document INT NULL,
  block VARCHAR(512) NULL,
  is_good_room TINYINT(1) NULL,
  is_block_similar_ads_other_agent TINYINT(1) NULL,
  project_oid VARCHAR(128) NULL,
  project_id INT NULL,
  unit_number VARCHAR(64) NULL,
  unit_number_display TINYINT(1) NULL,
  shop_alias VARCHAR(255) NULL,
  shop_json JSON NULL,
  special_display TINYINT(1) NULL,
  sticky_ad_type VARCHAR(64) NULL,
  sticky_ad_feature VARCHAR(512) NULL,
  total_rating INT NULL,
  total_rating_for_seller INT NULL,
  average_rating TINYINT NULL,
  average_rating_for_seller TINYINT NULL,
  phone VARCHAR(64) NULL,
  phone_hidden VARCHAR(64) NULL,
  region_name VARCHAR(255) NULL,
  region_name_v3 VARCHAR(255) NULL,
  area_name VARCHAR(255) NULL,
  ward_name VARCHAR(255) NULL,
  ward_name_v3 VARCHAR(255) NULL,
  KEY idx_area_category (area_v2, category),
  KEY idx_list_time (list_time),
  KEY idx_account_oid (account_oid),
  CONSTRAINT fk_listing_seller FOREIGN KEY (account_oid) REFERENCES chotot_seller (account_oid) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_seller_phone (
  account_oid VARCHAR(64) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  source_ad_id BIGINT NULL,
  PRIMARY KEY (account_oid, phone),
  KEY idx_seller_phone_oid (account_oid),
  CONSTRAINT fk_seller_phone_seller FOREIGN KEY (account_oid) REFERENCES chotot_seller (account_oid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_listing_media (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ad_id BIGINT NOT NULL,
  media_kind VARCHAR(16) NOT NULL,
  media_url TEXT NULL,
  video_thumbnail_url TEXT NULL,
  video_gif_url TEXT NULL,
  video_external_id BIGINT NULL,
  KEY idx_media_ad (ad_id),
  CONSTRAINT fk_media_listing FOREIGN KEY (ad_id) REFERENCES chotot_listing (ad_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_listing_image_backup (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ad_id BIGINT NOT NULL,
  backup_source_key VARCHAR(512) NULL,
  backup_storage_ref TEXT NULL,
  backup_cloud_name VARCHAR(64) NULL,
  backup_status VARCHAR(32) NULL,
  KEY idx_bak_ad (ad_id),
  KEY idx_bak_ad_status (ad_id, backup_status),
  CONSTRAINT fk_bak_listing FOREIGN KEY (ad_id) REFERENCES chotot_listing (ad_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chotot_listing_list_item (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ad_id BIGINT NOT NULL,
  list_kind VARCHAR(64) NOT NULL,
  element_value TEXT NULL,
  KEY idx_li_ad_kind (ad_id, list_kind),
  CONSTRAINT fk_li_listing FOREIGN KEY (ad_id) REFERENCES chotot_listing (ad_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_user (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(128) NOT NULL,
  email VARCHAR(255) NULL,
  password_plain VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_app_user_username (username),
  UNIQUE KEY uk_app_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_user_listing_preference (
  user_id BIGINT NOT NULL,
  ad_id BIGINT NOT NULL,
  preference_type VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, ad_id, preference_type),
  KEY idx_pref_user_type_created (user_id, preference_type, created_at),
  KEY idx_pref_user_ad (user_id, ad_id),
  KEY idx_pref_ad_id (ad_id),
  CONSTRAINT fk_pref_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
  CONSTRAINT fk_pref_listing FOREIGN KEY (ad_id) REFERENCES chotot_listing (ad_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_user_notification_channel (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  channel_type VARCHAR(32) NOT NULL DEFAULT 'pushmore',
  webhook_url TEXT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_channel (user_id, channel_type),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
