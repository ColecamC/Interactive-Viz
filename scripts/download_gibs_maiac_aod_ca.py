#!/usr/bin/env python3
"""
Optional bulk download of NASA GIBS MAIAC AOD rasters for California (same layer as map.js).

Writes ONLY under data/gibs_aerosol_tiles_august_complex/ — does not modify existing data files.

GIBS docs: https://nasa-gibs.github.io/gibs-api-docs/access-basics/
Python examples: https://nasa-gibs.github.io/gibs-api-docs/python-usage/

Usage (from repo root):
  python3 scripts/download_gibs_maiac_aod_ca.py

Stdlib only (urllib); requires network.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "gibs_aerosol_tiles_august_complex")

WMS_BASE = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
LAYER = "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth"
BBOX = "-125,32,-114,42"
WIDTH = "1024"
HEIGHT = "1024"


def wms_url(day: date) -> str:
    ds = day.isoformat()
    q = urllib.parse.urlencode(
        {
            "SERVICE": "WMS",
            "REQUEST": "GetMap",
            "VERSION": "1.1.1",
            "LAYERS": LAYER,
            "STYLES": "",
            "SRS": "EPSG:4326",
            "BBOX": BBOX,
            "WIDTH": WIDTH,
            "HEIGHT": HEIGHT,
            "FORMAT": "image/png",
            "TRANSPARENT": "TRUE",
            "TIME": ds,
        }
    )
    return f"{WMS_BASE}?{q}"


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    start = date(2020, 8, 16)
    n_days = 89  # through 2020-11-12 (matches map.js DATES)
    ok = 0
    skipped = 0
    failed = 0

    for i in range(n_days):
        d = start + timedelta(days=i)
        path = os.path.join(OUT_DIR, f"{d.isoformat()}.png")
        if os.path.isfile(path) and os.path.getsize(path) > 1000:
            skipped += 1
            continue
        url = wms_url(d)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Interactive-Viz-gibs-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) < 500 or data[:8] != b"\x89PNG\r\n\x1a\n":
                print(f"WARN: unexpected response for {d}", file=sys.stderr)
                failed += 1
                continue
            with open(path, "wb") as f:
                f.write(data)
            ok += 1
            print(d.isoformat(), len(data), "bytes")
        except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
            print(f"ERR {d}: {e}", file=sys.stderr)
            failed += 1
        time.sleep(0.15)

    print(f"done: wrote {ok}, skipped existing {skipped}, failed {failed} -> {OUT_DIR}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
