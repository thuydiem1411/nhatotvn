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
- **OLD:** Quick check length, sau đó check coverage
- **NEW:** LUÔN check filename coverage (no quick check)
- **Code:** `fetchChotot.js` needsBackup line ~92-130
- **Logic:**
  1. Filter imgs_bak → chỉ lấy `s === 'ok'`
  2. Build Set of backed-up filenames
  3. Extract filenames from all media URLs
  4. Check if ALL filenames covered
  5. Allow surplus: 10 imgs_bak for 8 images OK nếu 8 filenames match
- **Benefit:** Chính xác, không thêm ads không cần thiết vào backup queue

### Fix 3: backupAdImages Skip Duplicates & Sync extractFilename
- **OLD:** Skip if `imgs_bak.length > 0`, extractFilename return full URL if no match
- **NEW:** Skip only 'ok' images, filter empty filenames, sync extractFilename
- **Code:** `imageBackup.js` backupAdImages line ~187-220, extractFilename line ~22-34
- **Changes:**
  1. Build successfulBackupSrcs từ imgs_bak (`s === 'ok'`)
  2. Filter mediaNeedBackup: `filename && !has(filename)` (also filter empty)
  3. Sync extractFilename: return '' instead of url (match fetchChotot.js)
  4. Add debug log to show skip reason
- **Result:** Chỉ backup ads thực sự cần, skip chính xác

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

### Case 5: imgs_bak < images, NHƯNG full coverage (Duplicate URLs)
```json
{
  "images": ["url1.jpg", "url1.jpg", "url2.jpg"],  // ← url1 duplicate
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"}
  ]
}
→ imgs_bak.length (2) < images.length (3)
→ Extract filenames: ["file1.jpg", "file1.jpg", "file2.jpg"]
→ backedUpSrcs = Set(["file1.jpg", "file2.jpg"])
→ All covered? YES (file1 duplicate, file2 covered)
→ return false (skip, no quick check bypass) ✅
```

**Key improvement:** Không có quick check nữa → không bị false positive

---

Generated: 2026-03-28
