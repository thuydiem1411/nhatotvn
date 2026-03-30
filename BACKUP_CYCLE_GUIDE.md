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
- **Code:** `fetchChotot.js` mergeByAdId line ~338-357

### Fix 2: needsBackup Filter Before Compare  
- **OLD:** Count ALL imgs_bak vs mediaCount
- **NEW:** Count only 'ok' + 'rate_limit' (exclude fail/error)
- **Code:** `fetchChotot.js` needsBackup line ~64-103

### Fix 3: backupAdImages Skip Duplicates ⭐
- **OLD:** Skip if `imgs_bak.length > 0` → 509/511 ads skipped
- **NEW:** Skip only images với `s === 'ok'`, backup còn lại
- **Code:** `imageBackup.js` backupAdImages line ~187-220, ~300-313
- **Result:** Backup ~509 ads thay vì 2

## Status Classification

**Valid (COUNT for compare):**
- `'ok'` ✅ - Backed up successfully
- `'rate_limit'` ⏳ - Temporary, can retry

**Invalid (IGNORE):**
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

---

Generated: 2026-03-28
