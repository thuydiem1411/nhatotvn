# Multi-Category Crawl Implementation - Testing Guide

## ✅ Implementation Completed

### Changes Summary:

1. **fetchChotot.js** - Updated crawler to support 2 categories
   - Added CATEGORIES array: ["1050", "1020"] (Trọ, Nhà ở)
   - Updated file naming: `ads-{areaId}-{categoryName}.json`
   - Added category info to each ad: `ad.category`, `ad.category_name`
   - Loop through both categories per area

2. **split_ads_backup.py** - Python script to split backup/nobackup
   - Splits ONLY "tro" (1050) JSON files into backup (all ads) and nobackup (old data without imgs_bak)
   - "Nha" (1020) files are NEW DATA - no nobackup files created
   - Backup file: `ads-{areaId}-tro.json` (continues to be updated by crawler)
   - Nobackup file: `ads-{areaId}-tro-nobackup.json` (READ-ONLY, old data only)

3. **server-chotot.js** - Updated API with category filter
   - New params: `category` (all/1050/1020), `only_backup` (true/false)
   - Implements merge & dedupe logic (backup file priority)
   - Streams JSON response

4. **Frontend UI** (index.html + app.js)
   - Added category dropdown: "Tất cả (Trọ + Nhà ở)", "Chỉ Trọ", "Chỉ Nhà ở"
   - Added category badges on cards (Trọ = blue, Nhà ở = green)
   - Updated checkbox label: "Chỉ data mới" (checked = new data only, unchecked = include old data from nobackup)
   - Updated event listeners to reload ads on filter change

## 🧪 Testing Steps

### Step 1: Verify Crawler Changes (fetchChotot.js)

**Option A: Dry run test (recommended first)**
```bash
# Check syntax
node -c fetchChotot.js
```

**Option B: Test crawl manually (requires running server)**
```javascript
// In node REPL or temporary test file:
import fetchChotot from './fetchChotot.js';
// Check that it exports correctly
```

**Expected Results:**
- Files created: `ads-13110-tro.json`, `ads-13110-nha.json` (or current area)
- Each ad has `category` and `category_name` fields
- Console logs show crawling both categories

### Step 2: Test Python Script

**Prepare test data:**
```bash
# If you have existing ads-*.json files, rename them first
# Example: ads-13096.json → ads-13096-tro.json (manual rename for testing)
```

**Run split script:**
```bash
# Process single tro file
python split_ads_backup.py public-chotot/data/ads-13096-tro.json

# Or process all files (will auto-skip nha files)
python split_ads_backup.py --all

# Or process only tro category
python split_ads_backup.py --category=tro
```

**Expected Results:**
- Backup file (tro): `ads-13096-tro.json` (CHỈ chứa ads CÓ imgs_bak)
- Nobackup file (tro): `ads-13096-tro-nobackup.json` (CHỈ chứa ads KHÔNG CÓ imgs_bak)
- Backup file (nha): `ads-13096-nha.json` (chứa ALL ads - vì là data mới)
- **NO nobackup file for nha** (new data, no old data exists)
- Console shows: backup count + nobackup count = total (no overlap)
- Console shows "Skipping 'nha' file" messages

**Verify:**
```bash
# Check file sizes (backup >= nobackup for tro)
ls -lh public-chotot/data/ads-*-tro*.json

# Verify no nobackup files for nha
ls public-chotot/data/ads-*-nha-nobackup.json
# Should show: No such file or directory
```

### Step 3: Test API Endpoint

**Start server:**
```bash
node server-chotot.js
```

**Test API calls:**
```bash
# Test 1: Get all categories, only backup
curl "http://localhost:3009/api/ads?category=all&only_backup=true"

# Test 2: Get only Trọ (1050), with nobackup
curl "http://localhost:3009/api/ads?category=1050&only_backup=false"

# Test 3: Get only Nhà ở (1020), only backup
curl "http://localhost:3009/api/ads?category=1020&only_backup=true"

# Test 4: Default (all categories, with nobackup)
curl "http://localhost:3009/api/ads"
```

**Expected Results:**
- JSON array returned
- Ads have `category` and `category_name` fields
- Console logs show file processing statistics
- Dedupe works (no duplicate ad_id)

**Verify dedupe logic:**
```bash
# Check that backup file takes priority over nobackup
# If same ad_id exists in both files, version from backup file should be used
```

### Step 4: Test Frontend UI

**Open browser:**
```
http://localhost:3009/
```

**Test UI filters:**

1. **Category dropdown:**
   - Select "Tất cả (Trọ + Nhà ở)" → Should show all ads
   - Select "Chỉ Trọ" → Should show only category 1050 ads
   - Select "Chỉ Nhà ở" → Should show only category 1020 ads

2. **Category badges:**
   - Trọ ads should have blue badge with bed icon
   - Nhà ở ads should have green badge with house icon
   - Badges should be clearly visible next to price

3. **"Chỉ data mới" checkbox:**
   - When checked: Only new data (backup files only - no nobackup)
   - When unchecked: Include old data (backup + nobackup files merged)
   - Note: "Nhà ở" (1020) không có old data, checkbox chỉ ảnh hưởng "Trọ" (1050)

4. **Combined filters:**
   - Category + Backup checkbox
   - Category + Area/Ward filters
   - All filters together

**Expected Behavior:**
- Filters work correctly in combination
- Ad count updates when filters change
- Map markers update based on filtered ads
- No console errors

### Step 5: Integration Test - Full Crawl Cycle

**Enable cronjob:**
```bash
# Set in .env file
ENABLE_CRONJOB=true
```

**Start server and wait for cron:**
```bash
node server-chotot.js
```

**Monitor logs:**
- Should crawl 1 area for both categories (1050, 1020)
- Should save files: `ads-{areaId}-tro.json`, `ads-{areaId}-nha.json`
- Should backup images for both files
- Area index should increment

**Verify files:**
```bash
# List all ads files
ls -lh public-chotot/data/ads-*.json

# Count files (should have pairs: tro + nha for each area)
ls public-chotot/data/ads-*-tro.json | wc -l
ls public-chotot/data/ads-*-nha.json | wc -l
```

**Check data integrity:**
```bash
# Sample check: verify ads have category field
node -e "const ads = require('./public-chotot/data/ads-13096-tro.json'); console.log('Sample ad:', ads[0]?.category, ads[0]?.category_name);"
```

## 🔍 Common Issues & Solutions

### Issue 1: Old file format (ads-{areaId}.json)
**Solution:** Rename or delete old files, let crawler create new format

### Issue 2: Python script fails with memory error
**Solution:** Process files one by one instead of --all

### Issue 3: API returns empty array
**Solution:** Check file naming matches new convention (ads-*-tro.json, ads-*-nha.json)

### Issue 4: Category badges not showing
**Solution:** Check that ads have `category` field, verify CSS loaded

### Issue 5: Dedupe not working (duplicate ads)
**Solution:** Verify backup files are read before nobackup files in API

## 📋 Checklist

- [ ] Crawler creates files with new naming convention
- [ ] Python script splits backup/nobackup correctly
- [ ] API accepts category and only_backup params
- [ ] API dedupe logic works (backup priority)
- [ ] Frontend dropdown shows categories
- [ ] Frontend displays category badges
- [ ] Filters work correctly in combination
- [ ] No console errors in browser
- [ ] Full crawl cycle works end-to-end
- [ ] File count makes sense (2 per area: tro + nha)

## 🎉 Success Criteria

✅ Crawler creates 2 files per area (tro + nha)
✅ Python script splits files correctly
✅ API returns filtered data based on category
✅ UI shows category badges and filters work
✅ No data loss or corruption
✅ Performance acceptable (streaming works)

## 📝 Migration Notes

**If you have existing ads-{areaId}.json files:**

1. These were for category 1050 (Trọ) only
2. Rename them: `ads-{areaId}.json` → `ads-{areaId}-tro.json`
3. Run Python script to split backup/nobackup
4. Let crawler run to populate Nhà ở (1020) data

**Command to rename existing files:**
```bash
cd public-chotot/data
for f in ads-*.json; do
  # Skip files that already have category suffix
  if [[ ! "$f" =~ -(tro|nha)(-nobackup)?\.json$ ]]; then
    mv "$f" "${f%.json}-tro.json"
  fi
done
```
