# Plan: Simplify Backup Logic - Check Attempts Not Success

## Context

**Current Issue:**
- Logic hiện tại chỉ count imgs_bak với `s === 'ok'`
- Images có `s === 'fail'` sẽ bị retry mãi
- Một số images thực sự không tồn tại: "NoSuchKeyThe specified key does not exist"
- Waste time retry những images không thể backup

**New Approach:**
- Chỉ check xem ALL image filenames đã được **ATTEMPT** chưa (ok/fail/rate_limit đều OK)
- Nếu đã attempt hết → skip (dù có fail)
- **CHỈ recovery mới clear fail** để cho recovered ads cơ hội retry lại

---

## Changes Required

### 1. Update needsBackup() - fetchChotot.js

**Current Logic (line ~107-137):**
```javascript
// Filter: only count 'ok' success
const successfulBackups = ad.imgs_bak.filter(img => img.s === 'ok');

if (successfulBackups.length === 0) {
    // Clear failed imgs_bak
    ad.imgs_bak = [];
    return true;
}

// Check coverage with only 'ok'
const backedUpSrcs = new Set(successfulBackups.map(img => img.src));
```

**New Logic:**
```javascript
// Count ALL attempts (ok, fail, rate_limit, error)
// Do NOT filter by status
const allAttempts = ad.imgs_bak || [];

// No clear logic (except in recovery)
// Just check coverage with ALL attempts
const attemptedSrcs = new Set(allAttempts.map(img => img.src));

// Check if ALL filenames have been attempted
const mediaFilenames = allMedia.map(url => extractFilename(url)).filter(f => f);
const allAttempted = mediaFilenames.every(filename => attemptedSrcs.has(filename));

if (!allAttempted) {
    const missing = mediaFilenames.filter(f => !attemptedSrcs.has(f)).length;
    console.log(`   📊 Coverage check: ${missing} images not attempted yet`);
    return true;
}

// All filenames attempted (ok/fail doesn't matter) → skip
return false;
```

**Changes:**
- Remove `successfulBackups` filter
- Remove clear imgs_bak logic (moved to recovery only)
- Check ALL attempts, not just 'ok'
- Rename log: "not backed up" → "not attempted yet"

---

### 2. Update backupAdImages() - imageBackup.js

**Current Logic (line ~187-212):**
```javascript
// Skip only 'ok' images
const successfulBackupSrcs = new Set(
    existingBackups.filter(img => img.s === 'ok').map(img => img.src)
);

const mediaNeedBackup = allMedia.filter(url => {
    const filename = extractFilename(url);
    return filename && !successfulBackupSrcs.has(filename);
});
```

**New Logic:**
```javascript
// Skip ALL attempted images (ok, fail, rate_limit, error)
const attemptedSrcs = new Set(
    existingBackups.map(img => img.src) // No filter by status
);

const mediaNeedBackup = allMedia.filter(url => {
    const filename = extractFilename(url);
    return filename && !attemptedSrcs.has(filename);
});
```

**Changes:**
- Remove status filter
- Skip ALL filenames in imgs_bak (regardless of status)
- Only backup truly new filenames

---

### 3. Keep Recovery Clear Logic - fetchChotot.js

**No changes needed (line ~338-357):**
```javascript
if (nobackupSet.has(ad.ad_id)) {
    console.log(`🔄 Recovery detected: ad ${ad.ad_id}`);
    
    // Clear only failed imgs_bak, keep successful ones
    const successBackups = existing.imgs_bak.filter(img => img.s === 'ok');
    existing.imgs_bak = successBackups;
}
```

**Keep this logic:**
- Recovery still clears failed imgs_bak
- Gives recovered ads a chance to retry
- This is the ONLY place where failed imgs_bak are removed

---

## Expected Behavior After Changes

### Case 1: Ad với images đã attempt hết (mix ok/fail)
```json
{
  "images": ["url1.jpg", "url2.jpg", "url3.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": "cloud.webp", "c": "cloud1", "s": "ok"},
    {"src": "file2.jpg", "bak": null, "c": null, "s": "fail"},  // NoSuchKey
    {"src": "file3.jpg", "bak": "cloud.webp", "c": "cloud1", "s": "ok"}
  ]
}

needsBackup():
→ attemptedSrcs = Set(["file1.jpg", "file2.jpg", "file3.jpg"])
→ mediaFilenames = ["file1.jpg", "file2.jpg", "file3.jpg"]
→ All attempted? YES
→ return false ✅ Skip (kể cả file2.jpg fail, không retry)

backupAdImages():
→ Will not be called (needsBackup returned false)
```

### Case 2: Ad còn images chưa attempt
```json
{
  "images": ["url1.jpg", "url2.jpg", "url3.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": "cloud.webp", "c": "cloud1", "s": "ok"}
  ]
}

needsBackup():
→ attemptedSrcs = Set(["file1.jpg"])
→ mediaFilenames = ["file1.jpg", "file2.jpg", "file3.jpg"]
→ All attempted? NO (missing file2, file3)
→ return true ✅

backupAdImages():
→ attemptedSrcs = Set(["file1.jpg"])
→ mediaNeedBackup = ["url2.jpg", "url3.jpg"]  // Skip url1
→ Backup only url2 & url3
```

### Case 3: Recovery ad với failed imgs_bak
```json
// In nobackup file
{
  "ad_id": 123,
  "images": ["url1.jpg", "url2.jpg"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": null, "s": "fail"},
    {"src": "file2.jpg", "bak": null, "s": "fail"}
  ]
}

Recovery (mergeByAdId):
→ Clear failed imgs_bak
→ imgs_bak = [] ✅

needsBackup():
→ imgs_bak.length === 0
→ return true ✅

backupAdImages():
→ attemptedSrcs = Set([])  // Empty after clear
→ mediaNeedBackup = ["url1.jpg", "url2.jpg"]  // ALL images
→ Retry từ đầu ✅
```

---

## Benefits

1. **No Wasted Retries:** Images fail (NoSuchKey) không retry nữa
2. **Fast Skip:** Ads đã attempt hết → skip ngay (dù có fail)
3. **Recovery Retry:** Recovered ads vẫn có cơ hội retry (clear failed)
4. **Simpler Logic:** Không cần phân biệt ok/fail trong normal flow

---

## Files to Modify

1. **fetchChotot.js:**
   - needsBackup() line ~107-137: Remove filter, count ALL imgs_bak
   - mergeByAdId() line ~338-357: Keep recovery clear logic (no change)

2. **imageBackup.js:**
   - backupAdImages() line ~187-212: Remove filter, skip ALL imgs_bak filenames

3. **BACKUP_CYCLE_GUIDE.md:**
   - Update Fix 2 & Fix 3 descriptions
   - Update examples with new logic

---

## Test Scenarios

### Test 1: Ad với fail (NoSuchKey)
```powershell
# Tạo ad với 1 ok, 1 fail
node -e "
const fs = require('fs');
let ads = JSON.parse(fs.readFileSync('public-chotot/data/ads-13110-tro.json', 'utf-8'));
ads[0].images = ['url1.jpg', 'url2.jpg'];
ads[0].imgs_bak = [
  {src: 'file1.jpg', bak: 'cloud1.webp', c: 'cloud1', s: 'ok'},
  {src: 'file2.jpg', bak: null, c: null, s: 'fail'}
];
fs.writeFileSync('public-chotot/data/ads-13110-tro.json', JSON.stringify(ads));
"

# Restart crawler
node fetchChotot.js

# Expected: Skip ad (all filenames attempted)
```

### Test 2: Recovery ad
```powershell
# Ad trong nobackup với failed imgs_bak sẽ được clear và retry
# (logic không thay đổi)
```

---

## Summary

**Key Change:** "Has success?" → "Has attempt?"

**Status Classification:**
- **Attempted (SKIP):** ok, fail, rate_limit, error (anything in imgs_bak)
- **Not Attempted (BACKUP):** Filename not in imgs_bak

**Exception:** Recovery clears failed → allows retry for recovered ads

---

Generated: 2026-03-28
