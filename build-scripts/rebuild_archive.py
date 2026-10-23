#!/usr/bin/env python3
"""
Rebuild nemons-project archive with OS-specific scripts.
"""
import os
import tarfile
import zipfile
import shutil
from pathlib import Path

DOWNLOAD_DIR = Path("/home/z/my-project/download")
PROJECT_DIR = DOWNLOAD_DIR / "nemos-project"
NEW_ARCHIVE_DIR = DOWNLOAD_DIR

# Find the project directory using os.walk (bypasses bash issue)
def find_project_dir():
    for entry in os.scandir(DOWNLOAD_DIR):
        if entry.is_dir() and entry.name == "nemos-project":
            return Path(entry.path)
    return None

project = find_project_dir()
print(f"Found project at: {project}")

if not project:
    print("ERROR: nemos-project directory not found")
    exit(1)

# List all files
print("\nAll files in project:")
for root, dirs, files in os.walk(project):
    # Skip node_modules
    if "node_modules" in root:
        continue
    for f in files:
        full = Path(root) / f
        print(f"  {full.relative_to(project)}")

# Create tar.gz
print("\nCreating tar.gz...")
tar_path = DOWNLOAD_DIR / "nemos-project-v1.1.0.tar.gz"
with tarfile.open(tar_path, "w:gz") as tar:
    tar.add(project, arcname="nemos-project", filter=lambda info: None if "node_modules" in info.name or "package-lock" in info.name else info)
print(f"✓ Created: {tar_path}")
print(f"  Size: {tar_path.stat().st_size} bytes")

# Create zip
print("\nCreating zip...")
zip_path = DOWNLOAD_DIR / "nemos-project-v1.1.0.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(project):
        if "node_modules" in root:
            continue
        for f in files:
            if "package-lock" in f:
                continue
            full = Path(root) / f
            arcname = full.relative_to(project.parent)
            zipf.write(full, arcname)
print(f"✓ Created: {zip_path}")
print(f"  Size: {zip_path.stat().st_size} bytes")

# Verify contents
print("\nVerifying archives...")
with tarfile.open(tar_path, "r:gz") as tar:
    files = tar.getnames()
    print(f"tar.gz contains {len(files)} entries")
    # Show OS-specific files
    os_files = [f for f in files if "/scripts/linux/" in f or "/scripts/macos/" in f or "/scripts/windows/" in f]
    print(f"OS-specific scripts: {len(os_files)}")
    for f in os_files[:20]:
        print(f"  {f}")
