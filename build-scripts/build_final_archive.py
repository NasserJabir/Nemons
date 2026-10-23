#!/usr/bin/env python3
"""
Create final nemons-project archive with all OS-specific scripts.
"""
import os
import tarfile
import zipfile
from pathlib import Path

DOWNLOAD_DIR = Path("/home/z/my-project/download")
PROJECT_DIR = DOWNLOAD_DIR / "nemons-project"
TARGET_TAR = DOWNLOAD_DIR / "nemons-project-v1.1.0.tar.gz"
TARGET_ZIP = DOWNLOAD_DIR / "nemos-project-v1.1.0.zip"

print(f"Source: {PROJECT_DIR}")
print(f"Tar: {TARGET_TAR}")
print(f"Zip: {TARGET_ZIP}")

# Remove old archives if exist
for p in [TARGET_TAR, TARGET_ZIP]:
    if p.exists():
        p.unlink()
        print(f"Removed old: {p.name}")

# List all files (excluding node_modules and package-lock)
def should_skip(path_str):
    return ("node_modules" in path_str) or ("package-lock" in path_str)

print("\nScanning project files...")
all_files = []
for root, dirs, files in os.walk(PROJECT_DIR):
    # Skip node_modules
    if "node_modules" in root:
        continue
    for f in files:
        rel_path = os.path.relpath(os.path.join(root, f), PROJECT_DIR)
        if should_skip(rel_path):
            continue
        all_files.append((os.path.join(root, f), rel_path))

print(f"Found {len(all_files)} files")

# Show OS-specific scripts
print("\nOS-specific scripts found:")
os_files = [f for f in all_files if "/scripts/linux/" in f[0] or "/scripts/macos/" in f[0] or "/scripts/windows/" in f[0]]
for full, rel in sorted(os_files):
    print(f"  {rel}")

# Create tar.gz
print(f"\nCreating {TARGET_TAR.name}...")
with tarfile.open(TARGET_TAR, "w:gz") as tar:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        tar.add(full_path, arcname=arcname)
print(f"✓ Created: {TARGET_TAR} ({TARGET_TAR.stat().st_size} bytes)")

# Create zip
print(f"\nCreating {TARGET_ZIP.name}...")
with zipfile.ZipFile(TARGET_ZIP, "w", zipfile.ZIP_DEFLATED) as zipf:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        zipf.write(full_path, arcname=arcname)
print(f"✓ Created: {TARGET_ZIP} ({TARGET_ZIP.stat().st_size} bytes)")

# Verify contents
print("\n=== Verification ===")
with tarfile.open(TARGET_TAR, "r:gz") as tar:
    names = tar.getnames()
    print(f"tar.gz contains {len(names)} entries")
    
    # Count by category
    categories = {
        "nemos/ (CLI source)": 0,
        "scripts/linux/": 0,
        "scripts/macos/": 0,
        "scripts/windows/": 0,
        "scripts/ (universal)": 0,
        "plugins/": 0,
        "config/": 0,
        "personas/": 0,
        "knowledge/": 0,
        "governance/": 0,
        "monitoring/": 0,
        ".github/": 0,
        "Root files": 0,
    }
    
    for name in names:
        matched = False
        for cat in categories:
            if cat.replace(" (universal)", "").replace(" (CLI source)", "") in name:
                categories[cat] += 1
                matched = True
                break
        if not matched:
            categories["Root files"] += 1
    
    print("\nFiles by category:")
    for cat, count in categories.items():
        if count > 0:
            print(f"  {cat}: {count}")

print(f"\n✅ Archives ready:")
print(f"   {TARGET_TAR}")
print(f"   {TARGET_ZIP}")
