# Quick Test - New Crawl + Backup Flow

## Test the refactored flow

Write-Host "`n=== Testing New Crawl + Backup Flow ===" -ForegroundColor Cyan

## 1. Check current state
Write-Host "`n1. Checking current data state..." -ForegroundColor Yellow
$files = Get-ChildItem public-chotot\data\ads-*-tro.json -ErrorAction SilentlyContinue
Write-Host "Found $($files.Count) tro data files" -ForegroundColor Green

## 2. Start server to watch logs
Write-Host "`n2. Starting server to observe new flow..." -ForegroundColor Yellow
Write-Host "`nExpected log sequence:" -ForegroundColor Cyan
Write-Host "  1. 🔄 CRAWL PHASE: Starting..." -ForegroundColor White
Write-Host "  2. 📦 Crawling area X, category Y..." -ForegroundColor White
Write-Host "  3. ✅ CRAWL PHASE: Complete!" -ForegroundColor White
Write-Host "  4. 📸 BACKUP PHASE: Starting..." -ForegroundColor White
Write-Host "  5. 🔹 Small batch OR 🔸 Large batch" -ForegroundColor White
Write-Host "  6. ⏸️  BACKUP PHASE: Paused (if large batch)" -ForegroundColor White
Write-Host "`nWatch for these key indicators!" -ForegroundColor Magenta
Write-Host "`nPress Ctrl+C to stop`n" -ForegroundColor Red

node server-chotot.js

## Manual verification commands (run after observing logs):

# Check if needsBackup logic works
# python -c "import json; ads = json.load(open('public-chotot/data/ads-13116-tro.json')); need_backup = [a for a in ads if a.get('imgs_bak') and (not any(img.get('s') == 'ok' for img in a['imgs_bak']) or len(a['imgs_bak']) < len(a.get('images', [])))]; print(f'Ads need backup: {len(need_backup)}')"

# Check recovery count
# python -c "import json; import os; backup = json.load(open('public-chotot/data/ads-13116-tro.json')); nobackup = json.load(open('public-chotot/data/ads-13116-tro-nobackup.json')) if os.path.exists('public-chotot/data/ads-13116-tro-nobackup.json') else []; backup_ids = {a['ad_id'] for a in backup}; nobackup_ids = {a['ad_id'] for a in nobackup}; overlap = backup_ids & nobackup_ids; print(f'Backup: {len(backup_ids)}, Nobackup: {len(nobackup_ids)}, Overlap: {len(overlap)}')"
