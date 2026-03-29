# Quick Test - Cloudinary URL Optimization

## 1. Backup current data (if not already done)
$date = Get-Date -Format 'yyyyMMdd'
mkdir "public-chotot\data\backup-cloudinary-$date" -ErrorAction SilentlyContinue
copy public-chotot\data\ads-*-tro.json "public-chotot\data\backup-cloudinary-$date\"
Write-Host "Backup created at: backup-cloudinary-$date" -ForegroundColor Green

## 2. Run Python script to format data
Write-Host "`nRunning format script..." -ForegroundColor Cyan
python split_ads_backup.py --all

## 3. Verify shortened URLs
Write-Host "`nVerifying shortened URLs..." -ForegroundColor Cyan
python -c "import json; ads = json.load(open('public-chotot/data/ads-13116-tro.json')); ad = next((a for a in ads if a.get('imgs_bak', []) and any(img.get('s') == 'ok' for img in a['imgs_bak'])), None); img = ad['imgs_bak'][0] if ad and ad.get('imgs_bak') else {}; print(f'\nSample ad_id: {ad.get(\"ad_id\") if ad else \"None\"}'); print(f'src: {img.get(\"src\", \"None\")}'); print(f'bak: {img.get(\"bak\", \"None\")}'); print(f'cloudName (c): {img.get(\"c\", \"None\")}'); print(f'\nSrc is shortened: {not str(img.get(\"src\", \"\")).startswith(\"http\")}'); print(f'Bak is shortened: {not str(img.get(\"bak\", \"\")).startswith(\"http\")}')"

## 4. Calculate storage savings
Write-Host "`nCalculating storage savings..." -ForegroundColor Cyan
$oldSize = (Get-ChildItem "public-chotot\data\backup-cloudinary-$date\ads-*.json" | Measure-Object -Property Length -Sum).Sum
$newSize = (Get-ChildItem public-chotot\data\ads-*-tro.json | Measure-Object -Property Length -Sum).Sum
$saved = $oldSize - $newSize
$percent = ($saved / $oldSize) * 100

Write-Host "`nCloudinary URL Optimization Results:" -ForegroundColor Magenta
Write-Host "=================================" -ForegroundColor Magenta
Write-Host "Before: $([math]::Round($oldSize/1MB, 2)) MB" -ForegroundColor Yellow
Write-Host "After:  $([math]::Round($newSize/1MB, 2)) MB" -ForegroundColor Green
Write-Host "Saved:  $([math]::Round($saved/1MB, 2)) MB ($([math]::Round($percent, 1))%)" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Magenta

## 5. Start server for UI testing
Write-Host "`nStarting server..." -ForegroundColor Cyan
Write-Host "Open http://localhost:3000 to test UI" -ForegroundColor Yellow
Write-Host "Verify:" -ForegroundColor Yellow
Write-Host "  - Thumbnails display correctly" -ForegroundColor Yellow
Write-Host "  - Backup images load" -ForegroundColor Yellow
Write-Host "  - Modal images display" -ForegroundColor Yellow
Write-Host "`nPress Ctrl+C to stop server`n" -ForegroundColor Red
node server-chotot.js
