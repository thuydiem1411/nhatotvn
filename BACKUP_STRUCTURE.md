# 📸 Image Backup Structure - With Metadata

## 🎯 Data Structure (Final với Metadata)

### ✅ Array of Objects với tracking info:
```json
{
  "ad_id": "123456",
  "images": [
    "https://chotot.com/img1.jpg",
    "https://chotot.com/img2.jpg",
    "https://chotot.com/img3.jpg",
    "https://chotot.com/img4.jpg",
    "https://chotot.com/img5.jpg"
  ],
  "imgs_bak": [
    {
      "src": "https://chotot.com/img1.jpg",
      "bak": "https://res.cloudinary.com/account1/.../abc123.webp",
      "c": "account1",
      "s": "ok"
    },
    {
      "src": "https://chotot.com/img2.jpg",
      "bak": "https://res.cloudinary.com/account2/.../def456.webp",
      "c": "account2",
      "s": "ok"
    },
    {
      "src": "https://chotot.com/img3.jpg",
      "bak": null,
      "c": null,
      "s": "fail"
    },
    {
      "src": "https://chotot.com/img4.jpg",
      "bak": "https://res.cloudinary.com/account1/.../ghi789.webp",
      "c": "account1",
      "s": "ok"
    },
    {
      "src": "https://chotot.com/video1.mp4",
      "bak": "https://chotot.com/video1.mp4",
      "c": null,
      "s": "ok"
    }
  ]
}
```

## 📋 Field Definitions

### Short keys (để giảm file size):

| Key | Full Name | Description | Values |
|-----|-----------|-------------|--------|
| `src` | source | URL ảnh gốc | String URL |
| `bak` | backup | URL ảnh đã backup | String URL hoặc null |
| `c` | cloud | Cloudinary account name | String hoặc null |
| `s` | status | Trạng thái backup | 'ok', 'fail', 'error' |

### Status values:

- **`ok`**: Backup thành công
- **`fail`**: Backup thất bại (upload failed)
- **`error`**: Lỗi khi xử lý (download/resize error)

## 🔍 Queries & Tracking

### 1. Check ảnh nào đã backup:
```javascript
const successBackups = ad.imgs_bak.filter(img => img.s === 'ok');
console.log(`Backed up: ${successBackups.length}/${ad.imgs_bak.length}`);
```

### 2. Check ảnh nào failed:
```javascript
const failedBackups = ad.imgs_bak.filter(img => img.s !== 'ok');
console.log('Failed images:', failedBackups.map(img => img.src));
```

### 3. Check backup dùng account nào:
```javascript
const byAccount = ad.imgs_bak.reduce((acc, img) => {
  if (img.c) {
    acc[img.c] = (acc[img.c] || 0) + 1;
  }
  return acc;
}, {});

console.log('By account:', byAccount);
// { account1: 2, account2: 1 }
```

### 4. Get ảnh backup để hiển thị:
```javascript
// Thumbnail (ảnh backup đầu tiên thành công)
const thumbnail = ad.imgs_bak.find(img => img.s === 'ok')?.bak || ad.image;

// Gallery (tất cả ảnh backup thành công)
const gallery = ad.imgs_bak
  .filter(img => img.s === 'ok')
  .map(img => img.bak);
```

### 5. Retry failed backups:
```javascript
const needRetry = ad.imgs_bak.filter(img => img.s !== 'ok');
for (const img of needRetry) {
  // Re-backup img.src
}
```

## 🎨 Frontend Usage

### Listing (thumbnail):
```javascript
// Tìm ảnh backup đầu tiên thành công
const firstBackup = ad.imgs_bak?.find(img => img.s === 'ok')?.bak;

<img src="${ad.image}" 
     data-backup="${firstBackup || ''}"
     onerror="handleImageError(this)" />
```

### Detail view (gallery):
```javascript
// Hiển thị tất cả ảnh backup thành công
const successImages = ad.imgs_bak
  .filter(img => img.s === 'ok' && img.bak)
  .map(img => img.bak);

successImages.forEach(url => {
  gallery.add(`<img src="${url}" />`);
});
```

### Show backup status:
```javascript
const stats = {
  total: ad.imgs_bak.length,
  success: ad.imgs_bak.filter(img => img.s === 'ok').length,
  failed: ad.imgs_bak.filter(img => img.s !== 'ok').length
};

console.log(`Backup: ${stats.success}/${stats.total} (${stats.failed} failed)`);
```

## 📊 Storage Impact

### Size comparison:

**Simple array (old):**
```json
["url1", "url2", "url3"]
= ~150 bytes
```

**With metadata (new):**
```json
[
  {"src":"url1","bak":"url2","c":"acc1","s":"ok"},
  {"src":"url3","bak":"url4","c":"acc2","s":"ok"}
]
= ~300 bytes
```

**Overhead:** +150 bytes/ad (negligible)

**For 200K ads:**
- Old: 200K × 150B = 30MB
- New: 200K × 300B = 60MB
- **Extra: 30MB (acceptable)**

## 🔧 Benefits

### ✅ Track thành công/thất bại
```javascript
// Biết chính xác ảnh nào backup thành công
imgs_bak.filter(img => img.s === 'ok')
```

### ✅ Map source → backup
```javascript
// Tìm backup URL từ original URL
const original = "https://chotot.com/img1.jpg";
const backup = imgs_bak.find(img => img.src === original)?.bak;
```

### ✅ Account tracking
```javascript
// Biết ảnh nào dùng account nào
imgs_bak.filter(img => img.c === 'account1')
```

### ✅ Retry logic
```javascript
// Chỉ retry những ảnh failed
const toRetry = imgs_bak.filter(img => img.s !== 'ok');
```

### ✅ Analytics
```javascript
// Thống kê backup success rate
const rate = imgs_bak.filter(img => img.s === 'ok').length / imgs_bak.length;
console.log(`Success rate: ${(rate * 100).toFixed(1)}%`);
```

## 🛠️ Helper Functions

### Get all successful backups:
```javascript
function getSuccessfulBackups(ad) {
  return ad.imgs_bak
    ?.filter(img => img.s === 'ok' && img.bak)
    .map(img => img.bak) || [];
}
```

### Check if ad fully backed up:
```javascript
function isFullyBackedUp(ad) {
  if (!ad.imgs_bak || ad.imgs_bak.length === 0) return false;
  return ad.imgs_bak.every(img => img.s === 'ok');
}
```

### Get backup by account:
```javascript
function getBackupsByAccount(ad, accountName) {
  return ad.imgs_bak?.filter(img => img.c === accountName) || [];
}
```

### Retry failed backups:
```javascript
async function retryFailedBackups(ad) {
  const failed = ad.imgs_bak?.filter(img => img.s !== 'ok') || [];
  
  for (const failedImg of failed) {
    const result = await backupSingleImage(failedImg.src, ad.ad_id);
    if (result) {
      failedImg.bak = result.url;
      failedImg.c = result.cloudName;
      failedImg.s = 'ok';
    }
  }
  
  return ad;
}
```

## 📝 Example Queries

### Query 1: Find ads with partial backup:
```javascript
const partialBackup = ads.filter(ad => {
  const total = ad.imgs_bak?.length || 0;
  const success = ad.imgs_bak?.filter(img => img.s === 'ok').length || 0;
  return success > 0 && success < total;
});
```

### Query 2: Account usage stats:
```javascript
const accountStats = ads.reduce((stats, ad) => {
  ad.imgs_bak?.forEach(img => {
    if (img.c) {
      stats[img.c] = (stats[img.c] || 0) + 1;
    }
  });
  return stats;
}, {});

console.log('Images per account:', accountStats);
// { account1: 245123, account2: 254877 }
```

### Query 3: Overall success rate:
```javascript
const allBackups = ads.flatMap(ad => ad.imgs_bak || []);
const successRate = allBackups.filter(img => img.s === 'ok').length / allBackups.length;
console.log(`Overall success: ${(successRate * 100).toFixed(2)}%`);
```

---

**Status**: ✅ Production ready with full metadata tracking  
**Storage overhead**: +30MB (0.03%)  
**Benefits**: Full tracking, retry capability, analytics
