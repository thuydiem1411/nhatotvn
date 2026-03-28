# ✅ VERIFIED: File -nobackup Logic

## 🔒 Đảm bảo fetchChotot.js KHÔNG BAO GIỜ ghi vào file -nobackup

### ✅ Đã kiểm tra và xác nhận:

1. **getAreaFile(areaId, category)**
   - Return: `ads-{areaId}-{categoryName}.json` (backup file only)
   - KHÔNG bao giờ return path có `-nobackup`

2. **safeWriteFile(data, areaId, category)**
   - Ghi vào: `getAreaFile(areaId, category)` (backup file only)
   - KHÔNG bao giờ ghi vào file `-nobackup`

3. **mergeByAdId(newAds, areaId, category)**
   - Đọc từ: `getAreaFile(areaId, category)` (backup file only)
   - KHÔNG bao giờ đọc từ file `-nobackup`

4. **Grep check**
   - Không có từ "nobackup" nào trong `fetchChotot.js`
   - 100% safe!

### 📝 File Naming Logic

```javascript
// Category mapping
const CATEGORY_NAMES = {
    '1050': 'tro',
    '1020': 'nha'
};

// getAreaFile returns:
// - areaId=13096, category=1050 → "ads-13096-tro.json"
// - areaId=13096, category=1020 → "ads-13096-nha.json"
// - NEVER returns: "ads-13096-tro-nobackup.json" ❌
```

### 🔐 File Access Matrix

| File Type | Crawler (fetchChotot.js) | Python Script | API Server | Frontend |
|-----------|--------------------------|---------------|------------|----------|
| `ads-*-tro.json` (backup) | ✅ READ + WRITE | ✅ READ + WRITE | ✅ READ | ❌ |
| `ads-*-nha.json` (backup) | ✅ READ + WRITE | ⏭️ SKIP | ✅ READ | ❌ |
| `ads-*-tro-nobackup.json` | ❌ NEVER | ✅ WRITE ONCE | ✅ READ | ❌ |
| `ads-*-nha-nobackup.json` | ❌ NEVER | ❌ NEVER | ❌ N/A | ❌ |

### 🎯 Key Points

1. **Crawler behavior:**
   - ✅ CHỈ ghi vào file backup
   - ✅ Ghi TẤT CẢ ads (có hoặc chưa có imgs_bak)
   - ❌ KHÔNG BAO GIỜ ghi vào file -nobackup
   - ❌ KHÔNG BAO GIỜ đọc từ file -nobackup

2. **Python script behavior:**
   - ✅ Tạo file -nobackup CHỈ 1 LẦN (migration)
   - ✅ CHỈ xử lý file Trọ (1050)
   - ⏭️ SKIP file Nhà ở (1020) - không tạo nobackup

3. **File -nobackup là:**
   - 📖 READ-ONLY (chỉ dùng cho API đọc)
   - 📅 OLD DATA (data cũ chưa có imgs_bak)
   - 🔒 STATIC (không bao giờ update sau khi tạo)

## 🧪 Verification Commands

```bash
# 1. Grep check trong fetchChotot.js
grep -n "nobackup" fetchChotot.js
# Expected: No matches (✅)

# 2. Verify getAreaFile function
grep -A 3 "function getAreaFile" fetchChotot.js
# Expected: Chỉ return ads-{areaId}-{categoryName}.json

# 3. Verify safeWriteFile function
grep -A 5 "async function safeWriteFile" fetchChotot.js
# Expected: getAreaFile(areaId, category) - no nobackup

# 4. Check actual files created by crawler
ls public-chotot/data/ads-*.json
# Expected: 
#   - ads-*-tro.json (backup)
#   - ads-*-nha.json (backup)
#   - ads-*-tro-nobackup.json (chỉ tạo bởi Python, không phải crawler)
```

## ✅ Conclusion

**fetchChotot.js là SAFE - không bao giờ động chạm file -nobackup!**

- ✅ Code đã được review
- ✅ Comments đã được thêm vào
- ✅ Grep check pass (no "nobackup" in fetchChotot.js)
- ✅ Logic rõ ràng và an toàn

**File -nobackup chỉ được:**
1. Python script tạo 1 lần (migration)
2. API server đọc để merge với backup file
3. KHÔNG ai khác được sửa

🎉 System is safe and working as designed!
