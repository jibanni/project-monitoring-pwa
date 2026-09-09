#!/usr/bin/env python3
from pathlib import Path
import re
import sys

manifest = Path("android/app/src/main/AndroidManifest.xml")
if not manifest.exists():
    print(f"Missing {manifest}. Run this from the PMS10 project root.", file=sys.stderr)
    raise SystemExit(1)

text = manifest.read_text(encoding="utf-8")

permissions = [
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
]

missing = [p for p in permissions if p not in text]
if not missing:
    print("Android GPS/camera permissions already present.")
    raise SystemExit(0)

match = re.search(r"<manifest\b[^>]*>", text, flags=re.IGNORECASE | re.DOTALL)
if not match:
    print("Could not locate the opening <manifest> tag.", file=sys.stderr)
    raise SystemExit(1)

insert = "\n    " + "\n    ".join(missing)
text = text[:match.end()] + insert + text[match.end():]
manifest.write_text(text, encoding="utf-8")

print("Added Android permissions:")
for permission in missing:
    print(" -", permission)
