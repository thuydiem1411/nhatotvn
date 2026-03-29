#!/usr/bin/env python3
"""
Split ads JSON files into backup and nobackup files

IMPORTANT: Only splits "tro" (1050) files - "nha" (1020) is new data, no split needed

Usage:
    python split_ads_backup.py <file_path>          # Process single file
    python split_ads_backup.py --all                # Process all ads-*-tro.json files in data folder
    python split_ads_backup.py --category=tro       # Process all tro files
"""

import json
import sys
import os
import re
from pathlib import Path

def shorten_cloudinary_url(bak_url, cloud_name):
    """
    Shorten Cloudinary URL to relative path
    From: https://res.cloudinary.com/dsasutrzb/image/upload/v1772725254/chotot/170839644/file.webp
    To: v1772725254/chotot/170839644/file.webp
    
    Args:
        bak_url: Full Cloudinary URL
        cloud_name: Cloudinary cloud name
    
    Returns:
        Relative path or original URL if pattern doesn't match
    """
    if not bak_url or not isinstance(bak_url, str) or 'cloudinary.com' not in bak_url:
        return bak_url
    
    if not cloud_name:
        return bak_url
    
    # Pattern: https://res.cloudinary.com/{cloudName}/image/upload/{path}
    pattern = f"https://res\\.cloudinary\\.com/{cloud_name}/image/upload/(.+)$"
    match = re.search(pattern, bak_url)
    return match.group(1) if match else bak_url

def format_ad(ad):
    """
    Format ad data: remove redundant fields and shorten imgs_bak src to filename only
    
    Args:
        ad: Ad dict to format (in-place)
    
    Returns:
        Formatted ad dict
    """
    # Remove redundant image fields to save storage
    for field in ['image', 'webp_image', 'thumbnail_image', 'image_thumbnails', 'special_display_images']:
        ad.pop(field, None)
    
    # Shorten imgs_bak src to filename only
    if ad.get('imgs_bak'):
        for img in ad['imgs_bak']:
            src = img.get('src', '')
            
            # Handle video dict (src is a dict with video metadata)
            if isinstance(src, dict):
                # Extract URL from video dict (prefer thumbnail for display)
                video_url = src.get('thumbnail') or src.get('url') or src.get('gif_url')
                if video_url and isinstance(video_url, str):
                    # Extract filename from video URL
                    match = re.search(r'([^/]+\.(?:jpg|jpeg|png|webp|gif|m3u8))$', video_url, re.IGNORECASE)
                    if match:
                        img['src'] = match.group(1)
                    else:
                        # If no filename match, use video ID or keep dict
                        video_id = src.get('id')
                        if video_id:
                            img['src'] = f"video_{video_id}"
                        # else: keep original dict (will be handled by frontend)
            
            # Handle string URL
            elif isinstance(src, str) and src.startswith('http'):
                # Extract filename from URL (e.g., "https://.../.../FILENAME.jpg" -> "FILENAME.jpg")
                match = re.search(r'([^/]+\.(?:jpg|jpeg|png|webp|gif))$', src, re.IGNORECASE)
                if match:
                    img['src'] = match.group(1)
            
            # Shorten bak URL (Cloudinary backup URL)
            bak = img.get('bak')
            cloud_name = img.get('c')
            if bak and cloud_name:
                img['bak'] = shorten_cloudinary_url(bak, cloud_name)
    
    return ad

def is_outdated_ad(ad):
    """
    Check if ad is outdated (no successful image backup)
    
    Args:
        ad: Ad dict to check
    
    Returns:
        True if outdated (no imgs_bak success), False otherwise
    """
    imgs_bak = ad.get('imgs_bak', [])
    has_success_backup = any(img.get('s') == 'ok' for img in imgs_bak)
    return not has_success_backup

def split_ads_file(file_path):
    """
    Split a single JSON file into backup and nobackup files
    ONLY for "tro" (1050) category - "nha" (1020) is new data, no split needed
    
    Args:
        file_path: Path to the JSON file (e.g., ads-13096-tro.json)
    
    Returns:
        dict: Statistics about the operation
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        return None
    
    print(f"\n📂 Processing: {file_path.name}")
    
    # Check if this is a "nha" file - skip it (new data, no split needed)
    if '-nha.json' in file_path.name:
        print(f"⏭️  Skipping 'nha' file (new data, no nobackup file needed)")
        return {
            'file': file_path.name,
            'total': 0,
            'with_backup': 0,
            'without_backup': 0,
            'skipped': True
        }
    
    try:
        # Read JSON file (minified, single line)
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        
        if not content:
            print(f"⚠️  File is empty, skipping")
            return None
        
        # Parse JSON
        ads = json.loads(content)
        
        if not isinstance(ads, list):
            print(f"❌ Invalid JSON format (not an array)")
            return None
        
        print(f"📊 Total ads: {len(ads)}")
        
        # Format all ads first (remove redundant fields, shorten imgs_bak src)
        print(f"🔧 Formatting ads (removing redundant fields, shortening imgs_bak)...")
        for ad in ads:
            format_ad(ad)
        
        # Separate ads into backup (with imgs_bak success) and nobackup (without imgs_bak success)
        ads_with_backup = []      # Ads with imgs_bak success → save to backup file (usable)
        ads_without_backup = []   # Ads without imgs_bak success → save to nobackup file (outdated)
        
        for ad in ads:
            if is_outdated_ad(ad):
                ads_without_backup.append(ad)  # No imgs_bak success → outdated
            else:
                ads_with_backup.append(ad)     # Has imgs_bak success → usable
        
        print(f"✅ Ads with backup (usable data): {len(ads_with_backup)}")
        print(f"📦 Ads without backup (outdated data): {len(ads_without_backup)}")
        
        # Verify total count
        if len(ads_with_backup) + len(ads_without_backup) != len(ads):
            print(f"⚠️  WARNING: Total mismatch! {len(ads_with_backup)} + {len(ads_without_backup)} != {len(ads)}")
        
        # Write original file (keep name, ONLY ads WITH imgs_bak success - usable data)
        original_file = file_path
        with open(original_file, 'w', encoding='utf-8') as f:
            json.dump(ads_with_backup, f, ensure_ascii=False, separators=(',', ':'))
        print(f"💾 Written backup file: {original_file.name} ({len(ads_with_backup)} ads WITH imgs_bak success - USABLE DATA)")
        
        # Write nobackup file (new name, ONLY ads WITHOUT imgs_bak success - outdated) - ONLY FOR TRO
        if ads_without_backup:
            nobackup_file = file_path.parent / f"{file_path.stem}-nobackup{file_path.suffix}"
            with open(nobackup_file, 'w', encoding='utf-8') as f:
                json.dump(ads_without_backup, f, ensure_ascii=False, separators=(',', ':'))
            print(f"💾 Written nobackup file: {nobackup_file.name} ({len(ads_without_backup)} ads WITHOUT imgs_bak success - OUTDATED)")
        else:
            print(f"ℹ️  No outdated ads, nobackup file not created")
        
        return {
            'file': file_path.name,
            'total': len(ads),
            'with_backup': len(ads_with_backup),
            'without_backup': len(ads_without_backup)
        }
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error: {e}")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    arg = sys.argv[1]
    
    # Determine data directory
    script_dir = Path(__file__).parent
    data_dir = script_dir / 'public-chotot' / 'data'
    
    if not data_dir.exists():
        print(f"❌ Data directory not found: {data_dir}")
        sys.exit(1)
    
    stats_list = []
    
    if arg == '--all':
        # Process all ads-*.json files (both old and new format)
        print(f"🔍 Processing all files in: {data_dir}")
        
        # Find files with new format (ads-*-*.json) excluding nobackup
        files_new_format = sorted(data_dir.glob('ads-*-*.json'))
        files_new_format = [f for f in files_new_format if '-nobackup' not in f.name]
        
        # Find files with old format (ads-*.json without category suffix)
        all_files = sorted(data_dir.glob('ads-*.json'))
        files_old_format = [
            f for f in all_files 
            if f.name.count('-') == 1  # Only one dash: ads-{areaId}.json
            and '-nobackup' not in f.name 
            and '-tmp' not in f.name
            and '-backup' not in f.name
        ]
        
        # Combine both formats
        files = files_old_format + files_new_format
        
        if not files:
            print("❌ No ads files found")
            print(f"ℹ️  Searched in: {data_dir}")
            print(f"ℹ️  Looking for: ads-*.json or ads-*-*.json")
            # List all files for debugging
            all_json = list(data_dir.glob('*.json'))
            if all_json:
                print(f"ℹ️  Found these JSON files:")
                for f in all_json[:10]:  # Show first 10
                    print(f"    - {f.name}")
            sys.exit(1)
        
        print(f"📋 Found {len(files)} files to process ({len(files_old_format)} old format, {len(files_new_format)} new format)")
        
        # Process old format files first (auto-rename to new format)
        for file_path in files_old_format:
            print(f"\n🔄 Migrating old format file: {file_path.name}")
            # Old format is assumed to be category 1050 (Trọ)
            # Rename to new format: ads-{areaId}.json → ads-{areaId}-tro.json
            area_id = file_path.stem.replace('ads-', '')
            new_file_path = file_path.parent / f"ads-{area_id}-tro.json"
            
            try:
                file_path.rename(new_file_path)
                print(f"✅ Renamed: {file_path.name} → {new_file_path.name}")
                # Process the renamed file
                stats = split_ads_file(new_file_path)
                if stats:
                    stats_list.append(stats)
            except Exception as e:
                print(f"❌ Failed to rename {file_path.name}: {e}")
        
        # Process new format files
        for file_path in files_new_format:
            stats = split_ads_file(file_path)
            if stats:
                stats_list.append(stats)
    
    elif arg.startswith('--category='):
        # Process files by category
        category = arg.split('=')[1]
        print(f"🔍 Processing category: {category}")
        files = sorted(data_dir.glob(f'ads-*-{category}.json'))
        
        if not files:
            print(f"❌ No {category} files found")
            sys.exit(1)
        
        print(f"📋 Found {len(files)} files to process")
        
        for file_path in files:
            stats = split_ads_file(file_path)
            if stats:
                stats_list.append(stats)
    
    else:
        # Process single file
        file_path = Path(arg)
        if not file_path.is_absolute():
            # If relative path, try data directory
            file_path = data_dir / arg
        
        stats = split_ads_file(file_path)
        if stats:
            stats_list.append(stats)
    
    # Print summary
    if stats_list:
        print("\n" + "="*60)
        print("📊 SUMMARY")
        print("="*60)
        
        # Filter out skipped files
        processed_stats = [s for s in stats_list if not s.get('skipped', False)]
        skipped_count = len([s for s in stats_list if s.get('skipped', False)])
        
        if processed_stats:
            total_ads = sum(s['total'] for s in processed_stats)
            total_with_backup = sum(s['with_backup'] for s in processed_stats)
            total_without_backup = sum(s['without_backup'] for s in processed_stats)
            
            print(f"Files processed: {len(processed_stats)}")
            print(f"Files skipped (nha - new data): {skipped_count}")
            print(f"Total ads: {total_ads}")
            print(f"Ads with backup (usable): {total_with_backup}")
            print(f"Ads without backup (outdated): {total_without_backup}")
            print(f"Backup percentage: {(total_with_backup / total_ads * 100) if total_ads > 0 else 0:.1f}%")
        else:
            print(f"No files processed (all {skipped_count} files skipped)")
        
        print("="*60)
        print("\n✅ All done!")
        print("\nℹ️  Note: 'nha' (1020) files are skipped - they contain new data only")
        print("ℹ️  Only 'tro' (1050) files are split (old data needs separation)")
    else:
        print("\n⚠️  No files were processed successfully")
        sys.exit(1)

if __name__ == '__main__':
    main()
