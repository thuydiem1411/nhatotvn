# Critical Fixes - Recovery & Backup Logic

## Vấn đề đã fix

### Fix 1: Recovery Clear imgs_bak ✅

**Vấn đề:** Khi ad được recovery từ nobackup, imgs_bak cũ (toàn fail) không bị xóa → compare length sai → không backup

**Solution trong mergeByAdId (line ~338-357):**

```javascript
// Check if this ad is being recovered from nobackup
if (nobackupSet.has(ad.ad_id)) {
    console.log(`🔄 Recovery detected: ad ${ad.ad_id} (was in nobackup, now re-crawled)`);
    recoveredIds.add(ad.ad_id);
    
    // Clear only failed imgs_bak, keep successful ones
    const existing = map.get(ad.ad_id);
    if (existing?.imgs_bak && existing.imgs_bak.length > 0) {
        const before = existing.imgs_bak.length;
        const successBackups = existing.imgs_bak.filter(img => img.s === 'ok');
        const removed = before - successBackups.length;
        
        if (removed > 0) {
            console.log(`   Removing ${removed} failed imgs_bak, keeping ${successBackups.length} successful`);
            existing.imgs_bak = successBackups;
        } else {
            console.log(`   All ${before} imgs_bak are successful, keeping all`);
        }
    }
}
```

**Result:** 
- Giữ lại imgs_bak có `s === 'ok'` (đã backup thành công)
- Chỉ xóa imgs_bak có status khác (fail, error, rate_limit)
- Cho phép backup lại những cái failed mà không mất những cái đã success

---

### Fix 2: needsBackup Filter imgs_bak ✅

**Vấn đề:** Compare length sử dụng TẤT CẢ imgs_bak (bao gồm cả fail/error) → không chính xác

**Solution trong needsBackup (line ~64-103):**

```javascript
function needsBackup(ad) {
    // Must have media
    const mediaCount = (ad.images?.length || 0) + (ad.videos?.length || 0);
    if (mediaCount === 0) return false;
    
    // No imgs_bak → needs backup
    if (!ad.imgs_bak || ad.imgs_bak.length === 0) return true;
    
    // Filter imgs_bak: only count valid attempts (ok, rate_limit)
    // Exclude: fail, error (those are hopeless, should retry)
    const validBackups = ad.imgs_bak.filter(img => img.s === 'ok' || img.s === 'rate_limit');
    
    // Has imgs_bak but all failed/error → clear and retry
    if (validBackups.length === 0) {
        console.log(`   🔄 Clearing ${ad.imgs_bak.length} failed imgs_bak for ad ${ad.ad_id}`);
        ad.imgs_bak = [];
        return true;
    }
    
    // Has some success: check if has at least one 'ok'
    const hasSuccess = validBackups.some(img => img.s === 'ok');
    if (!hasSuccess) {
        // Only has rate_limit, no success yet → needs retry
        return true;
    }
    
    // Compare length: valid backups vs media count
    if (validBackups.length < mediaCount) {
        console.log(`   📊 Length mismatch for ad ${ad.ad_id}: imgs_bak=${validBackups.length}, media=${mediaCount}`);
        return true;
    }
    
    // Same length + has success → skip
    return false;
}
```

**Key changes:**
- Filter `imgs_bak` → chỉ count status 'ok' và 'rate_limit'
- Loại bỏ 'fail' và 'error' (những cái không còn hy vọng)
- Compare `validBackups.length` với `mediaCount`

---

## Status Classification

### Valid statuses (COUNT):
- `'ok'`: Backup thành công ✅
- `'rate_limit'`: Tạm thời bị giới hạn, có thể retry sau ⏳

### Invalid statuses (IGNORE):
- `'fail'`: Download/upload failed, không thể backup ❌
- `'error'`: Lỗi khác, không thể backup ❌

---

## Test Cases

### Case 1: Recovery ad với imgs_bak toàn fail
```json
// Before recovery
// nobackup file:
{
  "ad_id": 174238279,
  "images": ["url1", "url2", "url3"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": null, "c": null, "s": "fail"},
    {"src": "file2.jpg", "bak": null, "c": null, "s": "fail"},
    {"src": "file3.jpg", "bak": null, "c": null, "s": "fail"}
  ]
}

// During recovery (mergeByAdId)
→ Recovery detected: ad 174238279
→ Removing 3 failed imgs_bak, keeping 0 successful
→ imgs_bak = []

// After recovery (needsBackup)
→ imgs_bak.length === 0 → return true
→ Backup process starts fresh
```

### Case 1b: Recovery ad với mix success/fail
```json
// Before recovery
// nobackup file:
{
  "ad_id": 174238280,
  "images": ["url1", "url2", "url3"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": "cloud1.webp", "c": "cloud1", "s": "ok"},
    {"src": "file2.jpg", "bak": null, "c": null, "s": "fail"},
    {"src": "file3.jpg", "bak": null, "c": null, "s": "error"}
  ]
}

// During recovery (mergeByAdId)
→ Recovery detected: ad 174238280
→ Removing 2 failed imgs_bak, keeping 1 successful
→ imgs_bak = [{"src": "file1.jpg", "bak": "cloud1.webp", "c": "cloud1", "s": "ok"}]

// After recovery (needsBackup)
→ validBackups.length = 1, mediaCount = 3
→ 1 < 3 → return true
→ Backup only 2 remaining images (không backup lại file1.jpg)
```

### Case 2: Ad với mix success/fail
```json
{
  "ad_id": 123456,
  "images": ["url1", "url2", "url3", "url4"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": "...", "c": "cloud1", "s": "ok"},       // Valid ✅
    {"src": "file2.jpg", "bak": null, "c": null, "s": "fail"},          // Invalid ❌
    {"src": "file3.jpg", "bak": null, "c": null, "s": "rate_limit"}     // Valid ⏳
  ]
}

// needsBackup check:
→ validBackups = [ok, rate_limit] → length = 2
→ mediaCount = 4
→ 2 < 4 → return true
→ 📊 Length mismatch: imgs_bak=2, media=4
→ Backup thêm 2 images còn lại
```

### Case 3: Ad đã backup đủ
```json
{
  "ad_id": 123456,
  "images": ["url1", "url2", "url3"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": "...", "c": "cloud1", "s": "ok"},
    {"src": "file2.jpg", "bak": "...", "c": "cloud2", "s": "ok"},
    {"src": "file3.jpg", "bak": null, "c": null, "s": "fail"}  // Ignored
  ]
}

// needsBackup check:
→ validBackups = [ok, ok] → length = 2
→ mediaCount = 3
→ BUT: hasSuccess = true, validBackups has 2 'ok'
→ Wait... 2 < 3 → return true
→ Backup thêm 1 image còn lại (replace failed one)
```

### Case 4: Ad toàn fail
```json
{
  "ad_id": 123456,
  "images": ["url1", "url2"],
  "imgs_bak": [
    {"src": "file1.jpg", "bak": null, "c": null, "s": "fail"},
    {"src": "file2.jpg", "bak": null, "c": null, "s": "error"}
  ]
}

// needsBackup check:
→ validBackups = [] → length = 0
→ validBackups.length === 0
→ 🔄 Clearing 2 failed imgs_bak
→ imgs_bak = []
→ return true
→ Backup lại từ đầu
```

---

## Workflow Example

### Scenario: Recovered ad bị ngắt giữa chừng

```
T0: Ad hết hạn
→ Ad trong nobackup với imgs_bak = [{s: 'fail'}, {s: 'fail'}]

T1: Ad được đăng lại, crawler detect
→ Recovery detected: ad 174238279
→ Clearing 2 failed imgs_bak entries to retry
→ imgs_bak = []
→ Save vào backup file

T2: Backup phase bắt đầu
→ needsBackup check: imgs_bak.length === 0? YES
→ Start backup...
→ [1/3] Upload success
→ imgs_bak = [{s: 'ok'}]
→ Ctrl+C ❌ (ngắt!)

T3: Crawler chạy lại
→ Ad 174238279 đã trong backup (không recovery nữa)
→ needsBackup check:
   - validBackups = [{s: 'ok'}] → length = 1
   - mediaCount = 3
   - 1 < 3 → return true ✅
→ Continue backup images 2 & 3

T4: Backup tiếp tục
→ [2/3] Upload success
→ [3/3] Upload success
→ imgs_bak = [{s: 'ok'}, {s: 'ok'}, {s: 'ok'}]

T5: Crawler chạy lại
→ needsBackup check:
   - validBackups.length = 3
   - mediaCount = 3
   - 3 === 3 AND hasSuccess → return false
→ Skip! ✅ Complete
```

---

## Summary

### Đảm bảo:

✅ **Recovery ad clear imgs_bak failed** - Force retry từ đầu  
✅ **Filter imgs_bak trước compare** - Chỉ count 'ok' + 'rate_limit'  
✅ **Length mismatch detection** - Backup thêm nếu thiếu  
✅ **Ngắt giữa chừng OK** - needsBackup detect thiếu và continue  
✅ **Không backup duplicate** - Skip khi đủ length + has success  

---

## Debug Commands

### Check ads cần backup:
```powershell
python -c "import json; ads = json.load(open('public-chotot/data/ads-13116-tro.json')); need = [a for a in ads if (a.get('imgs_bak') and len([i for i in a['imgs_bak'] if i.get('s') in ['ok', 'rate_limit']]) < len(a.get('images', []))) or (a.get('imgs_bak') and not any(i.get('s') == 'ok' for i in a['imgs_bak']))]; print(f'Ads need backup: {len(need)}')"
```

### Check recovered ads:
```powershell
python -c "import json, os; backup = json.load(open('public-chotot/data/ads-13116-tro.json')); nobackup = json.load(open('public-chotot/data/ads-13116-tro-nobackup.json')) if os.path.exists('public-chotot/data/ads-13116-tro-nobackup.json') else []; recovered = [a for a in backup if any(n['ad_id'] == a['ad_id'] for n in nobackup)]; print(f'Recovered ads still in nobackup: {len(recovered)}')"
```

---

Generated: 2026-03-28
