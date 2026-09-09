#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import subprocess
import hashlib
import sys

ROOT = Path.cwd()
GOOD_COMMIT = "6d0f6ee"
REL = "src/pages/ProjectUpdates.tsx"
TARGET = ROOT / REL
MAIN = ROOT / "src/main.tsx"
BRIDGE_IMPORT = "import './utils/nativeAndroidBridge'"

def fail(message):
    print(f"\n[PMS10] {message}\n", file=sys.stderr)
    raise SystemExit(1)

if not (ROOT / "package.json").exists():
    fail("Run this script from ~/project-monitoring-pwa.")

try:
    restored = subprocess.check_output(
        ["git", "show", f"{GOOD_COMMIT}:{REL}"],
        cwd=ROOT,
    )
except subprocess.CalledProcessError:
    fail("Could not read ProjectUpdates.tsx from 6d0f6ee. Run git fetch --all first.")

if len(restored) < 5000:
    fail("Historical ProjectUpdates.tsx is unexpectedly small. No file was changed.")

if TARGET.exists():
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = ROOT / "backups" / f"project-updates-before-stepper-recovery-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    (backup_dir / "ProjectUpdates.tsx").write_bytes(TARGET.read_bytes())
    print(f"Backup: {backup_dir / 'ProjectUpdates.tsx'}")

TARGET.write_bytes(restored)

# Verify the working file is byte-for-byte identical to Git history.
current = TARGET.read_bytes()
if hashlib.sha256(current).digest() != hashlib.sha256(restored).digest():
    fail("Restore verification failed.")

if not MAIN.exists():
    fail("src/main.tsx was not found.")

main = MAIN.read_text(encoding="utf-8")
if BRIDGE_IMPORT not in main:
    MAIN.write_text(BRIDGE_IMPORT + "\n" + main, encoding="utf-8")

print("")
print("PMS10 Project Update recovery complete.")
print(f"  Restored {REL} byte-for-byte from {GOOD_COMMIT}")
print("  ProjectUpdates.tsx itself was NOT modified for Android GPS/photo.")
print("  Android native support is isolated in src/utils/nativeAndroidBridge.ts")
print("")
print("Now run:")
print("  python3 scripts/pms10_add_android_permissions_v2.py")
print("  npm run build")
