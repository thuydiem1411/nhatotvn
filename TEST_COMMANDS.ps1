# Quick Test Commands

## 1. Backup existing data
mkdir public-chotot\data\backup-20260328
copy public-chotot\data\ads-*.json public-chotot\data\backup-20260328\

## 2. Run Python script to format and split
python split_ads_backup.py --all

## 3. Check file sizes (compare before/after)
# Before (from backup)
Get-ChildItem public-chotot\data\backup-20260328\ads-*-tro.json | Select Name, @{N='Size(KB)';E={[math]::Round($_.Length/1KB,2)}}

# After
Get-ChildItem public-chotot\data\ads-*-tro.json | Select Name, @{N='Size(KB)';E={[math]::Round($_.Length/1KB,2)}}

## 4. Count ads in backup vs nobackup
$backup = (Get-Content public-chotot\data\ads-13116-tro.json | ConvertFrom-Json).Count
$nobackup = (Get-Content public-chotot\data\ads-13116-tro-nobackup.json -ErrorAction SilentlyContinue | ConvertFrom-Json).Count
Write-Host "ads-13116-tro.json: $backup ads (usable)" -ForegroundColor Green
Write-Host "ads-13116-tro-nobackup.json: $nobackup ads (outdated)" -ForegroundColor Yellow
Write-Host "Total: $($backup + $nobackup) ads" -ForegroundColor Cyan

## 5. Sample one ad to verify format
$ad = (Get-Content public-chotot\data\ads-13116-tro.json | ConvertFrom-Json)[0]
Write-Host "Sample ad_id: $($ad.ad_id)"
Write-Host "Has 'image' field? $($null -ne $ad.image)" -ForegroundColor $(if ($null -eq $ad.image) {'Green'} else {'Red'})
Write-Host "Has 'images' field? $($null -ne $ad.images)" -ForegroundColor $(if ($null -ne $ad.images) {'Green'} else {'Red'})
Write-Host "imgs_bak[0].src: $($ad.imgs_bak[0].src)" -ForegroundColor $(if ($ad.imgs_bak[0].src -notlike 'http*') {'Green'} else {'Red'})

## 6. Calculate total storage savings
$backupSize = (Get-ChildItem public-chotot\data\backup-20260328\ads-*.json | Measure-Object -Property Length -Sum).Sum
$currentSize = (Get-ChildItem public-chotot\data\ads-*-tro.json | Measure-Object -Property Length -Sum).Sum
$saved = $backupSize - $currentSize
$percent = ($saved / $backupSize) * 100
Write-Host "`nStorage Savings:" -ForegroundColor Cyan
Write-Host "Before: $([math]::Round($backupSize/1MB, 2)) MB" -ForegroundColor Yellow
Write-Host "After: $([math]::Round($currentSize/1MB, 2)) MB" -ForegroundColor Green
Write-Host "Saved: $([math]::Round($saved/1MB, 2)) MB ($([math]::Round($percent, 1))%)" -ForegroundColor Magenta

## 7. Start server and test
node server-chotot.js

## 8. Open browser to test UI
start http://localhost:3000

## 9. Restore from backup (if needed)
copy public-chotot\data\backup-20260328\*.json public-chotot\data\ -Force
