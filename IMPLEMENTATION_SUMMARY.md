# Multi-Category Crawl System - Implementation Summary

## 🎯 Những gì đã thay đổi

### 1. Crawler (fetchChotot.js)
- ✅ Crawl 2 categories: **Trọ (1050)** và **Nhà ở (1020)**
- ✅ File naming mới: `ads-{areaId}-tro.json`, `ads-{areaId}-nha.json`
- ✅ Mỗi ad có thêm fields: `category`, `category_name`
- ✅ Mỗi cron cycle crawl 1 area cho CẢ 2 categories

### 2. Python Script (split_ads_backup.py)
- ✅ Tách data cũ (chưa backup) ra file riêng
- ✅ **CHỈ tạo nobackup cho Trọ (1050)** - data cũ
- ✅ **Nhà ở (1020) KHÔNG có nobackup** - là data mới hoàn toàn
- ⚠️ Chạy 1 lần duy nhất để migration

### 3. API Server (server-chotot.js)
- ✅ `/api/ads` hỗ trợ filter: `?category=all|1050|1020&only_backup=true|false`
- ✅ Merge logic: ưu tiên backup file > nobackup file
- ✅ Streaming response (hiệu suất cao)

### 4. Frontend UI
- ✅ Dropdown filter: "Tất cả", "Chỉ Trọ", "Chỉ Nhà ở"
- ✅ Category badges trên card:
  - 🛏️ Trọ: Badge xanh dương với icon giường
  - 🏡 Nhà ở: Badge xanh lá với icon nhà
- ✅ Checkbox đổi label: **"Chỉ data mới"**
  - ✔️ Checked: chỉ data mới (backup files)
  - ❌ Unchecked: bao gồm data cũ (backup + nobackup)

## 📂 File Structure

```
public-chotot/data/
├── ads-13096-tro.json           # Trọ - NEW DATA (crawler updates this)
├── ads-13096-tro-nobackup.json  # Trọ - OLD DATA (read-only)
├── ads-13096-nha.json           # Nhà ở - NEW DATA (crawler updates this)
├── ads-13110-tro.json
├── ads-13110-tro-nobackup.json
├── ads-13110-nha.json
└── ... (more areas)
```

**Quan trọng:**
- ✅ File backup: Luôn được crawler cập nhật
- ❌ File nobackup: KHÔNG bao giờ được crawler động chạm (chỉ dùng cho API đọc)
- ⚠️ Nhà ở (1020) KHÔNG có file nobackup

## 🚀 Quick Start

### Bước 1: Migration data cũ (chỉ chạy 1 lần)

```bash
# Nếu có file ads-{areaId}.json cũ, rename thành ads-{areaId}-tro.json
# Example: ads-13096.json → ads-13096-tro.json

# Run Python script để tách backup/nobackup
python split_ads_backup.py --all
```

### Bước 2: Start server

```bash
node server-chotot.js
```

### Bước 3: Test UI

Mở browser: `http://localhost:3009/`

**Features mới:**
1. Dropdown "Loại tin": chọn Tất cả / Chỉ Trọ / Chỉ Nhà ở
2. Category badge hiển thị trên mỗi card
3. Checkbox "Chỉ data mới" để lọc data

## 📊 Data Flow

```
Crawler (fetchChotot.js)
    ↓
Crawl Area X, Category 1050 → ads-13096-tro.json (ALL ADS)
Crawl Area X, Category 1020 → ads-13096-nha.json (ALL ADS)
    ↓
Python Script (split_ads_backup.py) - RUN ONCE
    ↓
Split tro.json → ads-13096-tro-nobackup.json (OLD DATA)
Skip nha.json → (no nobackup, all new data)
    ↓
API (server-chotot.js)
    ↓
Merge & Dedupe (backup priority)
    ↓
Frontend UI (category filter + badges)
```

## 🧪 Testing Checklist

### Crawler Test
- [ ] File `ads-*-tro.json` được tạo
- [ ] File `ads-*-nha.json` được tạo
- [ ] Mỗi ad có `category` và `category_name`

### Python Script Test
- [ ] File `ads-*-tro-nobackup.json` được tạo
- [ ] File `ads-*-nha-nobackup.json` KHÔNG được tạo (skipped)
- [ ] Console hiển thị "Skipping 'nha' file"

### API Test
```bash
# Test category filter
curl "http://localhost:3009/api/ads?category=1050"  # Chỉ Trọ
curl "http://localhost:3009/api/ads?category=1020"  # Chỉ Nhà ở
curl "http://localhost:3009/api/ads?category=all"   # Tất cả

# Test only_backup filter
curl "http://localhost:3009/api/ads?only_backup=true"   # Data mới
curl "http://localhost:3009/api/ads?only_backup=false"  # Data mới + cũ
```

### UI Test
- [ ] Dropdown category hoạt động
- [ ] Category badges hiển thị đúng (Trọ = blue, Nhà ở = green)
- [ ] Checkbox "Chỉ data mới" hoạt động
- [ ] Filters kết hợp đúng

## 🎨 UI Visual Guide

**Category Badges:**
- 🛏️ **Trọ**: Badge xanh dương (`#17a2b8`) + icon `mdi-bunk-bed`
- 🏡 **Nhà ở**: Badge xanh lá (`#28a745`) + icon `mdi-home`

**Filter Options:**
- **Loại tin**: Tất cả (Trọ + Nhà ở) | Chỉ Trọ | Chỉ Nhà ở
- **Checkbox**: ✔️ Chỉ data mới | ❌ Bao gồm data cũ

## ⚠️ Important Notes

1. **File nobackup CHỈ cho Trọ (1050)**
   - Là data cũ từ trước khi có hệ thống backup ảnh
   - Nhà ở (1020) là data mới, không có file nobackup

2. **Crawler behavior**
   - LUÔN ghi vào file backup (bất kể có imgs_bak hay chưa)
   - KHÔNG BAO GIỜ động file nobackup

3. **API dedupe**
   - Ưu tiên data từ backup file (mới nhất)
   - Data từ nobackup chỉ dùng khi ad_id không có trong backup

4. **Checkbox "Chỉ data mới"**
   - Checked (mặc định): Chỉ lấy data từ file backup
   - Unchecked: Merge cả backup + nobackup (chỉ ảnh hưởng Trọ)

## 🔧 Maintenance

**Nếu muốn xóa data cũ (nobackup):**
```bash
# Delete all nobackup files (keep backup files only)
rm public-chotot/data/*-nobackup.json
```

**Nếu muốn reset và crawl lại:**
```bash
# Backup old data first
mv public-chotot/data public-chotot/data-backup

# Create new data folder
mkdir public-chotot/data

# Restart server - crawler will populate new data
node server-chotot.js
```

## 📞 Support

Xem chi tiết testing: `TESTING_GUIDE.md`
Xem code changes: `git diff` hoặc `git log`
