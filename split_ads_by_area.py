#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script tách file ads.json theo area_v2
Tạo các file ads-{area_v2}.json riêng biệt cho từng khu vực
"""

import json
import os
from collections import defaultdict
from pathlib import Path

def split_ads_by_area(input_file, output_dir):
    """
    Tách dữ liệu ads theo area_v2
    
    Args:
        input_file (str): Đường dẫn đến file ads.json
        output_dir (str): Thư mục output để lưu các file tách
    """
    
    print(f"📖 Đang đọc file: {input_file}")
    
    # Đọc file JSON gốc
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"📊 Tổng số ads: {len(data)}")
    
    # Tạo thư mục output nếu chưa có
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Nhóm ads theo area_v2
    area_groups = defaultdict(list)
    
    for ad in data:
        area_v2 = ad.get('area_v2', 'unknown')
        area_groups[area_v2].append(ad)
    
    print(f"🗺️ Tìm thấy {len(area_groups)} khu vực khác nhau:")
    
    # Lưu từng nhóm vào file riêng
    for area_v2, ads in area_groups.items():
        output_file = os.path.join(output_dir, f"ads-{area_v2}.json")
        
        # Giữ nguyên cấu trúc dữ liệu gốc (list các ads)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(ads, f, ensure_ascii=False, indent=2)
        
        print(f"💾 Khu vực {area_v2}: {len(ads)} ads -> {output_file}")
    
    print(f"✅ Hoàn thành tách dữ liệu!")

def main():
    # Đường dẫn file input và output
    input_file = "public-chotot/data/ads.json"
    output_dir = "public-chotot/data/split"
    
    # Kiểm tra file input có tồn tại không
    if not os.path.exists(input_file):
        print(f"❌ Không tìm thấy file: {input_file}")
        return
    
    try:
        split_ads_by_area(input_file, output_dir)
    except Exception as e:
        print(f"❌ Lỗi: {e}")

if __name__ == "__main__":
    main()
