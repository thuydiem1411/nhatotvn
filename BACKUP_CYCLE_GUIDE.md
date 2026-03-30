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

### Fix 2: needsBackup — attempt-based filename coverage
- **NEW:** Mỗi filename ảnh/video hiện tại phải có **ít nhất một dòng** trong `imgs_bak` (bất kỳ `s`), không chỉ `ok`.
- **Code:** `fetchChotot.js` `needsBackup`
- **Logic:**
  1. Build `attemptedSrcs` từ **mọi** `imgs_bak[].src` (string)
  2. Extract filename từ mọi URL media (bỏ filename rỗng)
  3. Nếu mọi filename đều có trong `attemptedSrcs` → **không** cần backup (kể cả toàn `fail` — CDN hết key không retry vòng lặp)
  4. Không xóa `imgs_bak` fail ở đây; chỉ **recovery** (tin ra khỏi nobackup) mới strip fail và giữ `ok` để thử lại
- **Benefit:** Hàng đợi backup không kẹt vì ảnh chết; vẫn backup thêm khi có filename mới chưa có trong `imgs_bak`

### Fix 3: backupAdImages — skip theo “đã thử”, merge giữ fail
- **NEW:** Coi mọi `imgs_bak` entry là đã attempt; chỉ upload media chưa có filename trong set đó.
- **Code:** `imageBackup.js` `backupAdImages`
- **Merge:** `finalResults = [...existingBackups, ...backupResults]` — không bỏ dòng `fail`/`rate_limit` khi thêm ảnh mới.

## Status Classification

**Trong crawl/backup cycle (`needsBackup` / `backupAdImages`):**
- Mọi `s` (`ok`, `fail`, `rate_limit`, `error`) đều tính là **đã attempt** cho filename đó — không upload lại cùng filename trong luồng thường.

**Script `split_ads_backup.py` (tách usable / nobackup):**
- Vẫn dùng **ít nhất một** `s === 'ok'` để coi ad là “có backup dùng được”. Ad chỉ toàn `fail` vẫn vào nobackup — **cố ý**, khác với “đã xử lý xong” trong cycle.

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

### Case 1: Thiếu filename (chưa attempt đủ)
```json
{
  "images": ["url1.jpg", "url2.jpg", "url3.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"}
  ]
}
→ attemptedSrcs = Set(["file1.jpg", "file2.jpg"])
→ file3 chưa có → return true (need backup)
```

### Case 2: Đủ filename, toàn ok
```json
{
  "images": ["url1.jpg", "url2.jpg", "url3.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"},
    {"src": "file3.jpg", "s": "ok"}
  ]
}
→ All filenames in attemptedSrcs → return false
```

### Case 3: Đủ filename nhưng toàn fail (CDN chết) — không retry cycle
```json
{
  "images": ["url1.jpg", "url2.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "fail"},
    {"src": "file2.jpg", "s": "fail"}
  ]
}
→ attemptedSrcs có đủ file1, file2 → return false (coi “đã xử lý”)
```

### Case 4: imgs_bak dư, vẫn đủ coverage
```json
{
  "images": ["url1.jpg", "url2.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"},
    {"src": "old1.jpg", "s": "ok"}
  ]
}
→ return false
```

### Case 5: Duplicate URL trong images
```json
{
  "images": ["url1.jpg", "url1.jpg", "url2.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "s": "ok"},
    {"src": "file2.jpg", "s": "ok"}
  ]
}
→ mediaFilenames unique coverage: file1 + file2 OK → return false
```

**Recovery:** Tin từ nobackup merge sẽ bỏ entry không `ok`, nên filename fail có thể được thử lại sau recovery.

---

Generated: 2026-03-28 · Updated: 2026-03-30 (attempt-based coverage)
