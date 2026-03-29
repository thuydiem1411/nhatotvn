# 🔍 LOGIC TÁCH FILE: Backup vs Nobackup

## ✅ ĐÚNG - Logic sau khi sửa

### Python Script (split_ads_backup.py)

**NGAY SAU KHI CHẠY SCRIPT (1 lần):**

```
ads-13096-tro.json (ORIGINAL)
├─ 1000 ads (500 có imgs_bak, 500 không có)
│
├──> SPLIT ──>
│
├─ ads-13096-tro.json (BACKUP FILE)
│  └─ 500 ads CÓ imgs_bak ✅
│
└─ ads-13096-tro-nobackup.json (NOBACKUP FILE)
   └─ 500 ads KHÔNG CÓ imgs_bak ✅

TOTAL: 500 + 500 = 1000 (không overlap)
```

### 📊 Chi tiết từng file:

| File | Nội dung NGAY SAU SPLIT | Crawler có ghi? | API có đọc? |
|------|------------------------|-----------------|-------------|
| `ads-*-tro.json` | **CHỈ ads CÓ imgs_bak** | ✅ Có (add ads mới) | ✅ Có |
| `ads-*-tro-nobackup.json` | **CHỈ ads KHÔNG CÓ imgs_bak** | ❌ Không (read-only) | ✅ Có |
| `ads-*-nha.json` | **ALL ads** (data mới) | ✅ Có (add ads mới) | ✅ Có |
| `ads-*-nha-nobackup.json` | **Không tồn tại** | ❌ Không | ❌ Không |

## 🔄 Timeline: Trước → Sau

### T0: Trước khi chạy Python script
```json
// ads-13096-tro.json (file gốc từ crawler cũ)
[
  { ad_id: 1, imgs_bak: [...] },    // có backup
  { ad_id: 2, imgs_bak: [...] },    // có backup
  { ad_id: 3 },                      // KHÔNG có backup
  { ad_id: 4 }                       // KHÔNG có backup
]
Total: 4 ads
```

### T1: Chạy Python script
```bash
python split_ads_backup.py --all
```

**KẾT QUẢ:**
```json
// ads-13096-tro.json (backup - giữ tên gốc)
[
  { ad_id: 1, imgs_bak: [...] },
  { ad_id: 2, imgs_bak: [...] }
]
Count: 2 ads (CHỈ CÓ BACKUP)

// ads-13096-tro-nobackup.json (nobackup - tên mới)
[
  { ad_id: 3 },
  { ad_id: 4 }
]
Count: 2 ads (CHỈ KHÔNG CÓ BACKUP)
```

✅ Tách hoàn toàn: 2 + 2 = 4 (không overlap)

### T2: Crawler chạy lần tiếp theo

**Crawler crawl và tìm thấy:**
- ad_id: 1 (đã có trong backup, merge)
- ad_id: 5 (mới, chưa có imgs_bak)
- ad_id: 6 (mới, chưa có imgs_bak)

**Crawler GHI VÀO backup file:**
```json
// ads-13096-tro.json (backup - crawler update)
[
  { ad_id: 1, imgs_bak: [...] },    // merged from old
  { ad_id: 2, imgs_bak: [...] },    // merged from old
  { ad_id: 5 },                      // NEW ad, chưa có backup
  { ad_id: 6 }                       // NEW ad, chưa có backup
]
Count: 4 ads (có cả ads mới chưa có backup)

// ads-13096-tro-nobackup.json (nobackup - KHÔNG ĐỔI)
[
  { ad_id: 3 },
  { ad_id: 4 }
]
Count: 2 ads (giữ nguyên - read-only)
```

### T3: Image backup process chạy

**Backup images cho ad_id: 5, 6**

```json
// ads-13096-tro.json (backup - crawler update again)
[
  { ad_id: 1, imgs_bak: [...] },
  { ad_id: 2, imgs_bak: [...] },
  { ad_id: 5, imgs_bak: [...] },    // ✅ Đã backup
  { ad_id: 6, imgs_bak: [...] }     // ✅ Đã backup
]
Count: 4 ads (giờ TẤT CẢ đều có backup)

// ads-13096-tro-nobackup.json (KHÔNG ĐỔI)
[
  { ad_id: 3 },
  { ad_id: 4 }
]
Count: 2 ads (vẫn giữ nguyên - read-only)
```

## 🎯 API Merge Logic

### Case 1: `only_backup=true` (checkbox "Chỉ data mới" ✔️)

```javascript
// Chỉ đọc backup files
Files: [ads-*-tro.json, ads-*-nha.json]
Result: [ad_id: 1, 2, 5, 6] // 4 ads
```

### Case 2: `only_backup=false` (checkbox unchecked ❌ - bao gồm data cũ)

```javascript
// Đọc cả backup + nobackup, merge với priority backup > nobackup
Files: [ads-*-tro.json, ads-*-nha.json, ads-*-tro-nobackup.json]

Step 1: Đọc backup files → Map { 1, 2, 5, 6 }
Step 2: Đọc nobackup files → Add { 3, 4 } (không trùng với backup)

Result: [ad_id: 1, 2, 3, 4, 5, 6] // 6 ads
```

## ⚠️ Key Clarifications

### ❓ Tại sao backup file lại có ads chưa có imgs_bak?

**Vì crawler liên tục crawl và add ads mới:**
- Ad mới được crawl → chưa có imgs_bak → add vào backup file
- Image backup process chạy sau → add imgs_bak vào ad
- Cycle tiếp theo → crawler merge và keep imgs_bak

### ❓ Tại sao không tách backup file mãi mãi?

**Vì đó là snapshot 1 thời điểm:**
- Python script chạy 1 lần để tách data CŨ
- File nobackup = snapshot data cũ chưa có backup (read-only)
- File backup = working file, luôn được crawler cập nhật (dynamic)

### ❓ File nobackup dùng để làm gì?

**Để preserve data cũ và cho phép filter:**
- Checkbox checked: Chỉ xem data mới (backup file)
- Checkbox unchecked: Xem cả data cũ (merge cả 2 files)
- User có thể so sánh data cũ vs mới

## ✅ Verification Checklist

- [ ] Python script tách đúng: backup + nobackup = total
- [ ] Backup file CHỈ chứa ads có imgs_bak (ngay sau split)
- [ ] Nobackup file CHỈ chứa ads không có imgs_bak
- [ ] Crawler GHI vào backup file (không động nobackup)
- [ ] API merge đúng: backup priority > nobackup
- [ ] UI checkbox hoạt động: checked = backup only, unchecked = merge all

🎉 Logic hoàn chỉnh và chính xác!
