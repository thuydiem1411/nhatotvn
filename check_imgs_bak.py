#!/usr/bin/env python3
"""Check imgs_bak structure in JSON files"""
import json
from pathlib import Path

# Read sample file
file_path = Path('public-chotot/data/ads-13099-tro.json')
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total ads: {len(data)}")

# Find first ad with imgs_bak
ad_with_imgs_bak = next((a for a in data if a.get('imgs_bak')), None)

if ad_with_imgs_bak:
    print(f"\nFound ad with imgs_bak:")
    print(f"  ad_id: {ad_with_imgs_bak.get('ad_id')}")
    print(f"  imgs_bak length: {len(ad_with_imgs_bak['imgs_bak'])}")
    print(f"\n  First imgs_bak entry:")
    first_img = ad_with_imgs_bak['imgs_bak'][0]
    print(f"    Type: {type(first_img)}")
    print(f"    Content: {first_img}")
    
    if isinstance(first_img, dict):
        src = first_img.get('src')
        print(f"\n  src field:")
        print(f"    Type: {type(src)}")
        print(f"    Value: {src}")
        
        # Check if src is dict or string
        if isinstance(src, dict):
            print("\n  ⚠️  WARNING: src is a dict, not a string!")
            print(f"    Dict keys: {list(src.keys())}")
        elif isinstance(src, str):
            print(f"\n  ✓ src is a string")
            print(f"    Starts with http: {src.startswith('http') if src else False}")
else:
    print("\n⚠️  No ads with imgs_bak found")
