from pathlib import Path

manifest = Path("android/app/src/main/AndroidManifest.xml")
if not manifest.exists():
    raise SystemExit(f"Missing {manifest}. Run this from the PMS10 project root.")

text = manifest.read_text(encoding="utf-8")
permissions = [
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
]

missing = [permission for permission in permissions if permission not in text]
if not missing:
    print("Android permissions already present.")
    raise SystemExit(0)

manifest_open_end = text.find(">")
if manifest_open_end < 0 or "<manifest" not in text[: manifest_open_end + 1]:
    raise SystemExit("Could not locate the opening <manifest> tag.")

insert = "\n" + "\n".join(missing) + "\n"
text = text[: manifest_open_end + 1] + insert + text[manifest_open_end + 1 :]
manifest.write_text(text, encoding="utf-8")
print("Added Android permissions:")
for permission in missing:
    print(" -", permission)
