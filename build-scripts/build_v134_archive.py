#!/usr/bin/env python3
"""
Build v1.3.4 - Fix the 'nemos' (without 'n') typo everywhere.
The correct spelling is 'nemos' (with 'n' between 'o' and 's').
"""
import zipfile
import tarfile
import os
import shutil
import subprocess
from pathlib import Path

DOWNLOAD = Path("/home/z/my-project/download")
V133_ZIP = DOWNLOAD / "nemos-project-v1.3.3.zip"
V134_ZIP = DOWNLOAD / "nemos-project-v1.3.4.zip"
V134_TAR = DOWNLOAD / "nemos-project-v1.3.4.tar.gz"
TEMP_DIR = DOWNLOAD / "_temp_v134"

# Step 1: Clean temp
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir()

# Step 2: Extract v1.3.3
print(f"Extracting {V133_ZIP.name}...")
result = subprocess.run(['unzip', '-q', str(V133_ZIP), '-d', str(TEMP_DIR)], capture_output=True, text=True)
if result.returncode != 0:
    print(f"Failed: {result.stderr}")
    exit(1)

project = TEMP_DIR / "nemos-project"
print(f"Project extracted to: {project}")

# Step 3: Fix the typo in ALL files
# Replace 'nemos' (5 chars, without 'n') with 'nemos' (6 chars, with 'n')
# Note: 'nemos' (without 'n') is NOT a substring of 'nemos' (with 'n'),
# so this replacement is safe.

# Also fix uppercase: 'NEMONS' (without 'n') -> 'NEMONS' (with 'n')
# But be careful: NEMONS_HOME, NEMONS_BIN are env var names that should keep their form

# Actually, let's just replace lowercase 'nemos' -> 'nemos' and uppercase 'NEMONS' -> 'NEMONS'
# (the uppercase is for display purposes, the lowercase is the actual command/file name)

print("\n=== Fixing typo in all files ===")
fixed_count = 0
for root, dirs, files in os.walk(project):
    if "node_modules" in root:
        continue
    for f in files:
        full_path = os.path.join(root, f)
        # Skip binary files
        try:
            with open(full_path, 'r', encoding='utf-8') as fp:
                content = fp.read()
        except:
            continue
        
        original = content
        
        # Replace lowercase 'nemos' (without 'n') with 'nemos' (with 'n')
        # Be careful to NOT replace 'nemos' that's already correct
        # 'nemos' (5 chars) is NOT a substring of 'nemos' (6 chars), so safe to replace
        
        # Use a marker to avoid double-replacement
        # Replace 'nemos' -> placeholder -> 'nemos'
        content = content.replace('nemos', '__NEMOS_PLACEHOLDER__')
        content = content.replace('__NEMOS_PLACEHOLDER__', 'nemons')
        
        # Also fix uppercase NEMONS -> NEMONS (for env vars and display)
        # But only if NEMONS (without 'n') exists
        # NEMONS (6 chars) is NOT a substring of NEMONS (7 chars), so safe
        content = content.replace('NEMONS', '__NEMONS_UPPER_PLACEHOLDER__')
        content = content.replace('__NEMONS_UPPER_PLACEHOLDER__', 'NEMONS')
        
        # Also fix NEMONS_ prefixes (env vars)
        content = content.replace('NEMONS_', '__NEMONS_ENV_PLACEHOLDER__')
        content = content.replace('__NEMONS_ENV_PLACEHOLDER__', 'NEMONS_')
        
        if content != original:
            with open(full_path, 'w', encoding='utf-8') as fp:
                fp.write(content)
            fixed_count += 1
            rel_path = os.path.relpath(full_path, project)
            print(f"  Fixed: {rel_path}")

print(f"\nTotal files fixed: {fixed_count}")

# Step 4: Verify the fix
print("\n=== Verification ===")
with open(project / "install.bat", 'r', encoding='utf-8') as f:
    content = f.read()
    for i, line in enumerate(content.split('\n'), 1):
        if 'NEMONS_BIN' in line and '=' in line and 'set' in line.lower():
            print(f"install.bat line {i}: {line.strip()}")
            # Check the path
            value = line.split('=', 1)[1].strip()
            if 'nemos.js' in value:
                print(f"  ✓ Contains 'nemos.js' (WITH 'n') - CORRECT!")
            else:
                print(f"  ✗ Still missing 'n' in filename!")
            break

# Step 5: Update version numbers
print("\n=== Updating version numbers ===")
for pkg in [project / "package.json", project / "nemos" / "package.json"]:
    if pkg.exists():
        content = pkg.read_text(encoding='utf-8')
        content = content.replace('"1.3.3"', '"1.3.4"').replace('"1.3.2"', '"1.3.4"').replace('"1.3.1"', '"1.3.4"')
        pkg.write_text(content, encoding='utf-8')
        print(f"  Updated: {pkg.relative_to(project)}")

# Step 6: Collect all files
print("\n=== Collecting files ===")
all_files = []
for root, dirs, files in os.walk(project):
    if "node_modules" in root:
        continue
    for f in files:
        if "package-lock" in f:
            continue
        rel = os.path.relpath(os.path.join(root, f), project)
        all_files.append((os.path.join(root, f), rel))

print(f"Total: {len(all_files)} files")

# Step 7: Remove old archives
for p in [V134_ZIP, V134_TAR]:
    if p.exists():
        p.unlink()

# Step 8: Create zip
print(f"\nCreating {V134_ZIP.name}...")
with zipfile.ZipFile(V134_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        zipf.write(full_path, arcname)
print(f"  Created: {V134_ZIP} ({V134_ZIP.stat().st_size} bytes)")

# Step 9: Create tar.gz
print(f"\nCreating {V134_TAR.name}...")
with tarfile.open(V134_TAR, "w:gz") as tar:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        tar.add(full_path, arcname=arcname)
print(f"  Created: {V134_TAR} ({V134_TAR.stat().st_size} bytes)")

# Step 10: Cleanup
shutil.rmtree(TEMP_DIR)

# Step 11: Final verification
print("\n=== Final Verification ===")
with zipfile.ZipFile(V134_ZIP, 'r') as z:
    # Check install.bat
    with z.open('nemos-project/install.bat') as f:
        content = f.read().decode('utf-8')
        for i, line in enumerate(content.split('\n'), 1):
            if 'NEMONS_BIN' in line and 'set' in line.lower():
                print(f"install.bat line {i}: {line.strip()}")
                if 'nemos.js' in line:
                    print(f"  ✓ Uses 'nemos.js' (WITH 'n') - CORRECT!")
                else:
                    print(f"  ✗ Still using wrong spelling!")
                break
    
    # Check start.bat
    with z.open('nemos-project/start.bat') as f:
        content = f.read().decode('utf-8')
        for i, line in enumerate(content.split('\n'), 1):
            if 'NEMONS_BIN' in line and 'set' in line.lower():
                print(f"start.bat line {i}: {line.strip()}")
                if 'nemos.js' in line:
                    print(f"  ✓ Uses 'nemos.js' (WITH 'n') - CORRECT!")
                break
    
    # Verify the actual file is still correctly named
    bin_files = [n for n in z.namelist() if '/bin/' in n and n.endswith('.js')]
    print(f"\nBin files in archive: {bin_files}")
    if any('nemos.js' in f for f in bin_files):
        print("  ✓ 'nemos.js' (WITH 'n') exists in archive")

print(f"\n✅ v1.3.4 archives ready:")
print(f"   {V134_ZIP}")
print(f"   {V134_TAR}")
