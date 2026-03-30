# Backup Cycle Configuration

## ENV Control

**File:** `.env`

```env
# Crawl cycle strategy
# true  -> BACKUP first (check all areas, backup >=10 first, then crawl)
# false -> CRAWL first (crawl all areas first, then backup >=10)
BACKUP_FIRST=false
```

## Two Strategies

### Strategy 1: BACKUP_FIRST=false (Default)
```
Loop:
  1. CRAWL all 22 areas x 2 categories (44 operations)
  2. BACKUP areas in order:
     - If < 10 ads need backup: backup, continue next area
     - If >= 10 ads need backup: backup, BREAK → return to crawl
```

**Use when:** Muốn data mới nhất trước khi backup

### Strategy 2: BACKUP_FIRST=true
```
Loop:
  1. BACKUP areas in order:
     - If < 10 ads need backup: backup, continue next area
     - If >= 10 ads need backup: backup, BREAK → crawl
  2. CRAWL all 22 areas x 2 categories (44 operations)
```

**Use when:** Muốn clear backlog (nhiều ads chưa backup) trước khi crawl thêm data

## Critical Fixes Applied

### Fix 1: Recovery Clear Only Failed imgs_bak
- **OLD:** Clear toàn bộ imgs_bak khi recovery
- **NEW:** Giữ lại `s === 'ok'`, chỉ xóa failed
- **Code:** `fetchChotot.js` mergeByAdId line ~350-370

### Fix 2: needsBackup Check Filename Coverage
- **OLD:** Count 'ok' + 'rate_limit' vs mediaCount (so sánh bằng)
- **NEW:** Check xem tất cả image filenames có trong imgs_bak ('ok' only) chưa
- **Code:** `fetchChotot.js` needsBackup line ~92-148
- **Logic:**
  1. Quick check: `imgs_bak.length < images.length` → need backup
  2. Full check: Build Set of backed-up filenames, check coverage
  3. Allow surplus: 10 imgs_bak for 8 images OK nếu 8 filenames match

### Fix 3: backupAdImages Skip Duplicates
- **OLD:** Skip if `imgs_bak.length > 0` → 509/511 ads skipped
- **NEW:** Skip only images với `s === 'ok'`, backup còn lại
- **Code:** `imageBackup.js` backupAdImages line ~187-220, ~300-313
- **Result:** Backup ~509 ads thay vì 2

## Status Classification

**Valid (for coverage check):**
- `'ok'` ✅ - Only count 'ok' as truly backed up

**Invalid (IGNORE):**
- `'rate_limit'` ⏳ - Temporary fail, need retry
- `'fail'` ❌ - Download/upload failed
- `'error'` ❌ - Other errors

## Test

```powershell
# Test default (CRAWL first)
$env:BACKUP_FIRST="false"
node fetchChotot.js

# Test alternate (BACKUP first)
$env:BACKUP_FIRST="true"
node fetchChotot.js
```

**Expected logs:**
- CRAWL PHASE / BACKUP PHASE in correct order
- Many upload logs (not just 2)
- High "Backed up X/Y" count

## Example Flow

### BACKUP_FIRST=false (Default)
```
🔄 CRAWL PHASE: Starting...
📦 Crawling area 13110, category 1050...
✅ Crawled 50 ads
...
✅ CRAWL PHASE: Complete!

📸 BACKUP PHASE: Starting...
📋 Area 13110: 511 ads need backup
🔸 Large batch (>= 10), backing up...
[1/511] ... ✅ Upload
...
✅ Backed up 509/511 ads
⏸️ BACKUP PHASE: Paused
🎉 Hoàn thành chu kỳ!

→ Next cycle: CRAWL again
```

### BACKUP_FIRST=true
```
📸 BACKUP PHASE: Starting...
📋 Area 13110: 511 ads need backup
🔸 Large batch (>= 10), backing up...
[1/511] ... ✅ Upload
...
✅ Backed up 509/511 ads
⏸️ BACKUP PHASE: Paused

🔄 CRAWL PHASE: Starting...
📦 Crawling area 13110...
✅ CRAWL PHASE: Complete!
🎉 Hoàn thành chu kỳ!

→ Next cycle: BACKUP again
```

## needsBackup Logic Examples

### Case 1: imgs_bak < images (Quick check)
```json
{
  "images": ["url1.jpg", "url2.jpg", "url3.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"}
  ]
}
→ imgs_bak.length (2) < images.length (3)
→ 📊 Length check: imgs_bak=2 < media=3
→ return true (need backup)
```

### Case 2: imgs_bak >= images, full coverage
```json
{
  "images": ["url1.jpg", "url2.jpg", "url3.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"},
    {"src": "file3.jpg", "s": "ok"}
  ]
}
→ Extract filenames: ["file1.jpg", "file2.jpg", "file3.jpg"]
→ backedUpSrcs = Set(["file1.jpg", "file2.jpg", "file3.jpg"])
→ All covered? YES
→ return false (skip backup)
```

### Case 3: imgs_bak dư, full coverage (OK!)
```json
{
  "images": ["url1.jpg", "url2.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"},
    {"src": "old1.jpg", "s": "ok"},  // ← Dư (old image)
    {"src": "old2.jpg", "s": "ok"}   // ← Dư (old image)
  ]
}
→ imgs_bak.length (4) >= images.length (2) ✅
→ Extract filenames: ["file1.jpg", "file2.jpg"]
→ backedUpSrcs = Set(["file1.jpg", "file2.jpg", "old1.jpg", "old2.jpg"])
→ All covered? YES (file1 & file2 in set)
→ return false (skip, imgs_bak dư OK)
```

### Case 4: imgs_bak dư, missing coverage
```json
{
  "images": ["url1.jpg", "url2.jpg", "url3.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"},
    {"src": "old1.jpg", "s": "ok"},
    {"src": "old2.jpg", "s": "ok"}
  ]
}
→ imgs_bak.length (4) >= images.length (3)
→ Extract filenames: ["file1.jpg", "file2.jpg", "file3.jpg"]
→ backedUpSrcs = Set(["file1.jpg", "file2.jpg", "old1.jpg", "old2.jpg"])
→ file3.jpg NOT in set
→ 📊 Coverage check: 1 images not backed up
→ return true (need backup for file3.jpg)
```

---

Generated: 2026-03-28
