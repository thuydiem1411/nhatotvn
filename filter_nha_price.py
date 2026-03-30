#!/usr/bin/env python3
"""
Remove house ads with price > 5,000,000 from local data files.

Target files:
- public-chotot/data/ads-*-nha.json
- public-chotot/data/ads-*-nha-nobackup.json (if exists)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

MAX_PRICE = 5_000_000
DATA_DIR = Path(__file__).resolve().parent / "public-chotot" / "data"


def parse_price_value(ad: dict) -> int | None:
    """Extract numeric VND price from ad payload."""
    raw_price = ad.get("price")
    if isinstance(raw_price, (int, float)):
        return int(raw_price)

    if isinstance(raw_price, str):
        digits = re.sub(r"\D", "", raw_price)
        if digits:
            return int(digits)

    raw_price_string = ad.get("price_string")
    if isinstance(raw_price_string, str):
        digits = re.sub(r"\D", "", raw_price_string)
        if digits:
            return int(digits)

    return None


def filter_file(file_path: Path) -> tuple[int, int]:
    """Filter one json file and return (before_count, after_count)."""
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"❌ Failed to read {file_path.name}: {exc}")
        return (0, 0)

    if not isinstance(data, list):
        print(f"⚠️ Skip {file_path.name}: JSON root is not a list")
        return (0, 0)

    before = len(data)
    filtered = []
    removed = 0

    for ad in data:
        if not isinstance(ad, dict):
            filtered.append(ad)
            continue

        price_val = parse_price_value(ad)
        if price_val is not None and price_val > MAX_PRICE:
            removed += 1
            continue

        filtered.append(ad)

    if removed > 0:
        file_path.write_text(
            json.dumps(filtered, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    after = len(filtered)
    print(f"✅ {file_path.name}: {before} -> {after} (removed {removed})")
    return (before, after)


def main() -> None:
    """Run filtering across all house data files."""
    if not DATA_DIR.exists():
        print(f"❌ Data directory not found: {DATA_DIR}")
        return

    patterns = ["ads-*-nha.json", "ads-*-nha-nobackup.json"]
    files: list[Path] = []
    for pattern in patterns:
        files.extend(sorted(DATA_DIR.glob(pattern)))

    if not files:
        print("ℹ️ No house data files found")
        return

    total_before = 0
    total_after = 0
    for file_path in files:
        before, after = filter_file(file_path)
        total_before += before
        total_after += after

    print(
        f"\n📊 Total: {total_before} -> {total_after} "
        f"(removed {total_before - total_after} ads with price > {MAX_PRICE})"
    )


if __name__ == "__main__":
    main()
