#!/usr/bin/env python3
"""Find ads with imgs_bak where src is not a string"""
import json
from pathlib import Path

file_path = Path(r'd:\Dev\OptimizeWork\RoomListing\public-chotot\data\ads-13116.json')
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total ads: {len(data)}")

# Find ads with imgs_bak where src is not a string
problematic_ads = []
for ad in data:
    if ad.get('imgs_bak'):
        for img in ad['imgs_bak']:
            src = img.get('src')
            if src is not None and not isinstance(src, str):
                problematic_ads.append({
                    'ad_id': ad.get('ad_id'),
                    'src_type': type(src).__name__,
                    'src_value': src
                })
                break  # Only record once per ad

print(f"\nProblematic ads (src is not string): {len(problematic_ads)}")
for i, prob in enumerate(problematic_ads[:5]):  # Show first 5
    print(f"\n{i+1}. ad_id: {prob['ad_id']}")
    print(f"   src type: {prob['src_type']}")
    print(f"   src value: {prob['src_value']}")
