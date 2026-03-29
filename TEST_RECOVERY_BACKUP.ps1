# Test Plan - Recovery & Backup Logic

## Test Commands

### 1. Kiểm tra needsBackup Logic

**Mục đích:** Verify filter imgs_bak trước khi compare length

```powershell
# Check ads cần backup trong 1 area
node -e "
const fs = require('fs');
const ads = JSON.parse(fs.readFileSync('public-chotot/data/ads-13116-tro.json', 'utf-8'));

let needBackup = 0;
let reasons = {
  noImgsBak: 0,
  allFailed: 0,
  lengthMismatch: 0,
  onlyRateLimit: 0
};

ads.forEach(ad => {
  if (ad.company_ad) return;
  
  const mediaCount = (ad.images?.length || 0) + (ad.videos?.length || 0);
  if (mediaCount === 0) return;
  
  if (!ad.imgs_bak || ad.imgs_bak.length === 0) {
    needBackup++;
    reasons.noImgsBak++;
    return;
  }
  
  const validBackups = ad.imgs_bak.filter(img => img.s === 'ok' || img.s === 'rate_limit');
  
  if (validBackups.length === 0) {
    needBackup++;
    reasons.allFailed++;
    console.log(\`Ad \${ad.ad_id}: All failed (total: \${ad.imgs_bak.length})\`);
    return;
  }
  
  const hasSuccess = validBackups.some(img => img.s === 'ok');
  if (!hasSuccess) {
    needBackup++;
    reasons.onlyRateLimit++;
    console.log(\`Ad \${ad.ad_id}: Only rate_limit\`);
    return;
  }
  
  if (validBackups.length < mediaCount) {
    needBackup++;
    reasons.lengthMismatch++;
    console.log(\`Ad \${ad.ad_id}: Length mismatch (valid: \${validBackups.length}, media: \${mediaCount})\`);
  }
});

console.log(\`\nTotal ads need backup: \${needBackup}\`);
console.log('Reasons:', reasons);
"
```

**Expected output:**
```
Ad 174238279: All failed (total: 3)
Ad 123456: Length mismatch (valid: 2, media: 4)

Total ads need backup: XX
Reasons: { noImgsBak: X, allFailed: X, lengthMismatch: X, onlyRateLimit: X }
```

---

### 2. Test Recovery Clear imgs_bak

**Setup:** Tạo 1 test ad trong nobackup với failed imgs_bak

```powershell
# 1. Tạo test nobackup file
node -e "
const fs = require('fs');
const testAd = {
  ad_id: 999999999,
  images: ['url1', 'url2', 'url3'],
  imgs_bak: [
    {src: 'file1.jpg', bak: null, c: null, s: 'fail'},
    {src: 'file2.jpg', bak: null, c: null, s: 'fail'},
    {src: 'file3.jpg', bak: null, c: null, s: 'fail'}
  ]
};
fs.writeFileSync('public-chotot/data/ads-13116-tro-nobackup.json', JSON.stringify([testAd]));
console.log('Created test nobackup file');
"
```

**Action:** Crawl để trigger recovery

```powershell
# 2. Start crawler (sẽ crawl ad 999999999 từ API)
node fetchChotot.js
```

**Verify logs:**
```
🔄 Recovery detected: ad 999999999 (was in nobackup, now re-crawled)
   Clearing 3 failed imgs_bak entries to retry
```

**Verify data:**
```powershell
# 3. Check backup file có ad với imgs_bak = []
node -e "
const fs = require('fs');
const ads = JSON.parse(fs.readFileSync('public-chotot/data/ads-13116-tro.json', 'utf-8'));
const testAd = ads.find(a => a.ad_id === 999999999);
if (testAd) {
  console.log('Ad found in backup file');
  console.log('imgs_bak length:', testAd.imgs_bak?.length || 0);
  if (!testAd.imgs_bak || testAd.imgs_bak.length === 0) {
    console.log('✅ PASS: imgs_bak cleared');
  } else {
    console.log('❌ FAIL: imgs_bak not cleared');
  }
} else {
  console.log('❌ FAIL: Ad not found in backup');
}
"
```

**Expected:**
```
Ad found in backup file
imgs_bak length: 0
✅ PASS: imgs_bak cleared
```

---

### 3. Test Interrupted Backup Resume

**Setup:** Create ad với partial backup

```powershell
# 1. Tạo ad với 1 success, 2 pending
node -e "
const fs = require('fs');
let ads = JSON.parse(fs.readFileSync('public-chotot/data/ads-13116-tro.json', 'utf-8'));
ads[0].images = ['url1', 'url2', 'url3'];
ads[0].imgs_bak = [
  {src: 'file1.jpg', bak: 'cloud1.webp', c: 'cloud1', s: 'ok'}
];
fs.writeFileSync('public-chotot/data/ads-13116-tro.json', JSON.stringify(ads));
console.log('Created partial backup ad:', ads[0].ad_id);
"
```

**Action:** Run backup phase

```powershell
# 2. Trigger backup
node fetchChotot.js
```

**Verify logs:**
```
📊 Length mismatch for ad XXXXX: imgs_bak=1, media=3
🔹 Small batch (< 10), backing up...
[1/1] Processing ad XXXXX...
✅ Backed up 1/1 ads
```

**Verify data:**
```powershell
# 3. Check imgs_bak length = 3
node -e "
const fs = require('fs');
const ads = JSON.parse(fs.readFileSync('public-chotot/data/ads-13116-tro.json', 'utf-8'));
const ad = ads[0];
console.log('Ad:', ad.ad_id);
console.log('imgs_bak length:', ad.imgs_bak?.length || 0);
const okCount = ad.imgs_bak?.filter(i => i.s === 'ok').length || 0;
console.log('OK count:', okCount);
if (okCount === 3) {
  console.log('✅ PASS: All images backed up');
} else {
  console.log('❌ FAIL: Not all images backed up');
}
"
```

---

### 4. Test Mix Success/Fail

**Setup:** Ad với mix status

```powershell
node -e "
const fs = require('fs');
let ads = JSON.parse(fs.readFileSync('public-chotot/data/ads-13116-tro.json', 'utf-8'));
ads[0].images = ['url1', 'url2', 'url3', 'url4'];
ads[0].imgs_bak = [
  {src: 'file1.jpg', bak: 'cloud1.webp', c: 'cloud1', s: 'ok'},
  {src: 'file2.jpg', bak: null, c: null, s: 'fail'},
  {src: 'file3.jpg', bak: null, c: null, s: 'rate_limit'}
];
fs.writeFileSync('public-chotot/data/ads-13116-tro.json', JSON.stringify(ads));
console.log('Created mix status ad:', ads[0].ad_id);
"
```

**Action:** Check needsBackup logic

```powershell
node -e "
const fs = require('fs');
const ads = JSON.parse(fs.readFileSync('public-chotot/data/ads-13116-tro.json', 'utf-8'));
const ad = ads[0];

const mediaCount = ad.images.length;
const validBackups = ad.imgs_bak.filter(img => img.s === 'ok' || img.s === 'rate_limit');

console.log('Ad:', ad.ad_id);
console.log('Total imgs_bak:', ad.imgs_bak.length);
console.log('Valid imgs_bak:', validBackups.length);
console.log('Media count:', mediaCount);
console.log('Needs backup:', validBackups.length < mediaCount);

if (validBackups.length === 2 && mediaCount === 4) {
  console.log('✅ PASS: Correctly filter out fail status');
} else {
  console.log('❌ FAIL: Filter logic error');
}
"
```

**Expected:**
```
Ad: XXXXX
Total imgs_bak: 3
Valid imgs_bak: 2
Media count: 4
Needs backup: true
✅ PASS: Correctly filter out fail status
```

---

## Test Scenarios Summary

| Scenario | Test | Expected Result |
|----------|------|-----------------|
| **Recovery** | Ad từ nobackup được crawl lại | imgs_bak cleared to [] |
| **All Failed** | Ad với imgs_bak toàn fail | needsBackup = true, clear imgs_bak |
| **Length Mismatch** | validBackups < mediaCount | needsBackup = true |
| **Mix Status** | ok + fail + rate_limit | Filter, count only ok + rate_limit |
| **Interrupted Backup** | Backup ngắt giữa chừng | Resume và backup tiếp |
| **Complete** | validBackups.length === mediaCount + hasSuccess | needsBackup = false |

---

## Quick Smoke Test

```powershell
# Full workflow test
Write-Host "Starting crawler..." -ForegroundColor Green
node fetchChotot.js

# Wait for 1 crawl + backup cycle
Start-Sleep -Seconds 60

# Check logs for keywords
$logFile = "C:\Users\DongPC\.cursor\projects\d-Dev-OptimizeWork-RoomListing\terminals\1.txt"
if (Test-Path $logFile) {
  Write-Host "`nChecking logs..." -ForegroundColor Yellow
  
  # Check crawl phase
  if (Select-String -Path $logFile -Pattern "CRAWL PHASE: Complete") {
    Write-Host "✅ Crawl phase completed" -ForegroundColor Green
  }
  
  # Check backup phase
  if (Select-String -Path $logFile -Pattern "BACKUP PHASE") {
    Write-Host "✅ Backup phase started" -ForegroundColor Green
  }
  
  # Check recovery
  $recoveries = Select-String -Path $logFile -Pattern "Recovery detected"
  if ($recoveries) {
    Write-Host "✅ Found $($recoveries.Count) recovered ads" -ForegroundColor Green
    
    # Check clearing
    $clears = Select-String -Path $logFile -Pattern "Clearing.*failed imgs_bak"
    if ($clears) {
      Write-Host "✅ imgs_bak cleared for recovered ads" -ForegroundColor Green
    }
  }
  
  # Check length mismatch
  $mismatches = Select-String -Path $logFile -Pattern "Length mismatch"
  if ($mismatches) {
    Write-Host "✅ Found $($mismatches.Count) length mismatches" -ForegroundColor Green
  }
}
```

---

Generated: 2026-03-28
