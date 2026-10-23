"""
Build Nemos v2.0.0 — FINAL VERSION
Architecture: No npm link dependency, no npx, no top-level await
"""
import zipfile
import tarfile
import os
import shutil
import subprocess
from pathlib import Path

DOWNLOAD = Path("/home/z/my-project/download")
V134_ZIP = DOWNLOAD / "nemos-project-v1.3.4.zip"
V2_ZIP = DOWNLOAD / "nemos-project-v2.0.0.zip"
V2_TAR = DOWNLOAD / "nemos-project-v2.0.0.tar.gz"
TEMP_DIR = DOWNLOAD / "_temp_v2"

# Step 1: Clean temp
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir()

# Step 2: Extract v1.3.4 as base
print(f"Extracting {V134_ZIP.name}...")
result = subprocess.run(['unzip', '-q', str(V134_ZIP), '-d', str(TEMP_DIR)], capture_output=True, text=True)
if result.returncode != 0:
    print(f"Failed: {result.stderr}")
    exit(1)

project = TEMP_DIR / "nemos-project"
print(f"Project extracted to: {project}")

# v2.0.0 install.bat
INSTALL_BAT = r'''@echo off
setlocal enabledelayedexpansion
title Nemos Installer v2.0.0

echo.
echo ============================================================
echo   Nemos v2.0.0 - Final Release
echo   Transparent Orchestration Layer for Coding Agents
echo ============================================================
echo.

set NEMOS_BIN=%~dp0nemos\bin\nemos.js

echo [1/8] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   Node.js %%v

echo.
echo [2/8] Checking npm...
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do echo   npm %%v

echo.
echo [3/8] Verifying installation file...
if not exist "%NEMOS_BIN%" (
    echo [ERROR] Cannot find: %NEMOS_BIN%
    echo The extraction was incomplete. Please:
    echo   1. Delete C:\nemos-project folder completely
    echo   2. Re-extract the v2.0.0 archive
    echo   3. Run install.bat again
    pause
    exit /b 1
)
echo   Found: %NEMOS_BIN%

echo.
echo [4/8] Installing dependencies...
pushd "%~dp0nemos"
call npm install --omit=dev
if errorlevel 1 (
    echo [ERROR] npm install failed
    popd
    pause
    exit /b 1
)
popd
echo   Dependencies installed

echo.
echo [5/8] Setting up Nemos home directory...
set NEMONS_HOME=%USERPROFILE%\.nemos
if not exist "%NEMONS_HOME%\config" mkdir "%NEMONS_HOME%\config"
if not exist "%NEMONS_HOME%\logs" mkdir "%NEMONS_HOME%\logs"
if not exist "%NEMONS_HOME%\experiences" mkdir "%NEMONS_HOME%\experiences"
if not exist "%NEMONS_HOME%\evidence" mkdir "%NEMONS_HOME%\evidence"
if not exist "%NEMONS_HOME%\run" mkdir "%NEMONS_HOME%\run"
if not exist "%NEMONS_HOME%\audit" mkdir "%NEMONS_HOME%\audit"
if not exist "%NEMONS_HOME%\context-packs" mkdir "%NEMONS_HOME%\context-packs"
if not exist "%NEMONS_HOME%\plugins" mkdir "%NEMONS_HOME%\plugins"
if exist "%~dp0config\daemon.yml" copy /y "%~dp0config\daemon.yml" "%NEMONS_HOME%\config\" >nul
if exist "%~dp0governance\governance-rules.yml" copy /y "%~dp0governance\governance-rules.yml" "%NEMONS_HOME%\config\" >nul
echo   Home: %NEMONS_HOME%

echo.
echo [6/8] Linking CLI globally (optional)...
pushd "%~dp0nemos"
call npm link 2>nul
popd
echo   Done (you can also use node directly)

echo.
echo [7/8] Starting daemon...
set NEMONS_HOME=%NEMONS_HOME%
echo   Running: node "%NEMOS_BIN%" daemon start
node "%NEMOS_BIN%" daemon start

echo.
echo [8/8] Verifying installation...
timeout /t 3 >nul
node "%NEMOS_BIN%" health

echo.
echo ============================================================
echo   Installation Complete!
echo ============================================================
echo.
echo   Dashboard:  http://localhost:3456
echo   Home:        %NEMONS_HOME%
echo   Binary:      %NEMOS_BIN%
echo.
echo   Quick commands (double-click these .bat files):
echo     start.bat       - Start daemon + open dashboard
echo     stop.bat        - Stop daemon
echo     verify.bat      - Run tests
echo     dashboard.bat   - Open dashboard
echo     plugin-install.bat - Install plugin for OpenCode
echo.
echo   Or from any CMD:
echo     node "%NEMOS_BIN%" daemon start
echo     node "%NEMOS_BIN%" health
echo     node "%NEMOS_BIN%" verify
echo     node "%NEMOS_BIN%" plugin install --agent opencode
echo.
echo Press any key to open dashboard...
pause >nul
start http://localhost:3456
'''

START_BAT = r'''@echo off
title Nemos Daemon - Start
echo Starting Nemos daemon...
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if not exist "%NEMOS_BIN%" (
    echo [ERROR] %NEMOS_BIN% not found
    echo Run install.bat first
    pause
    exit /b 1
)
node "%NEMOS_BIN%" daemon start
if not errorlevel 1 (
    echo.
    echo Dashboard: http://localhost:3456
    timeout /t 2 >nul
    start http://localhost:3456
)
'''

STOP_BAT = r'''@echo off
title Nemos Daemon - Stop
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if exist "%NEMOS_BIN%" node "%NEMOS_BIN%" daemon stop
pause
'''

VERIFY_BAT = r'''@echo off
title Nemos Verify
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if not exist "%NEMOS_BIN%" (
    echo [ERROR] %NEMOS_BIN% not found
    pause
    exit /b 1
)
echo Running verification tests...
node "%NEMOS_BIN%" verify
echo.
pause
'''

DASHBOARD_BAT = '''@echo off
start http://localhost:3456
'''

PLUGIN_INSTALL_BAT = r'''@echo off
title Nemos Plugin Installer
setlocal
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if not exist "%NEMOS_BIN%" (
    echo [ERROR] %NEMOS_BIN% not found
    echo Run install.bat first
    pause
    exit /b 1
)
if "%1"=="" (
    echo Installing plugins for all detected agents...
    node "%NEMOS_BIN%" plugin install
) else (
    echo Installing plugin for: %1
    node "%NEMOS_BIN%" plugin install --agent %1
)
echo.
pause
'''

INSTALL_SH = r'''#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
NC='\033[0m'
ok()    { echo -e "${GREEN}OK $1${NC}"; }
warn()  { echo -e "${YELLOW}WARN $1${NC}"; }
err()   { echo -e "${RED}FAIL $1${NC}"; }
step()  { echo -e "${CYAN}[nemos] $1${NC}"; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NEMOS_BIN="$SCRIPT_DIR/nemos/bin/nemos.js"

echo "============================================================"
echo -e "${CYAN}  Nemos v2.0.0 - Final Release${NC}"
echo "  OS: $(uname -s)"
echo "============================================================"

step "Step 1/8: Checking Node.js..."
command -v node &> /dev/null || { err "Node.js required"; exit 1; }
NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" -lt 18 ] && { err "Node 18+ required"; exit 1; }
ok "Node $NODE_VERSION"

step "Step 2/8: Checking npm..."
command -v npm &> /dev/null || { err "npm required"; exit 1; }
ok "npm $(npm -v)"

step "Step 3/8: Verifying installation file..."
[ -f "$NEMOS_BIN" ] || { err "Cannot find: $NEMOS_BIN"; exit 1; }
ok "Found: $NEMOS_BIN"

step "Step 4/8: Installing dependencies..."
(cd "$SCRIPT_DIR/nemos" && npm install --omit=dev)
ok "Dependencies installed"

step "Step 5/8: Setting up Nemos home..."
NEMONS_HOME="$HOME/.nemos"
mkdir -p "$NEMONS_HOME"/{config,logs,experiences,evidence,run,audit,context-packs,plugins}
[ -f "$SCRIPT_DIR/config/daemon.yml" ] && cp "$SCRIPT_DIR/config/daemon.yml" "$NEMONS_HOME/config/"
[ -f "$SCRIPT_DIR/governance/governance-rules.yml" ] && cp "$SCRIPT_DIR/governance/governance-rules.yml" "$NEMONS_HOME/config/"
ok "Home: $NEMONS_HOME"

step "Step 6/8: Linking CLI (optional)..."
(cd "$SCRIPT_DIR/nemos" && npm link 2>/dev/null) || warn "npm link failed - using direct node"
ok "Done"

step "Step 7/8: Starting daemon..."
export NEMONS_HOME="$NEMONS_HOME"
node "$NEMOS_BIN" daemon start || warn "Daemon start had issue"
sleep 2

step "Step 8/8: Verifying..."
node "$NEMOS_BIN" health

echo ""
echo "============================================================"
echo -e "${GREEN}  Installation Complete!${NC}"
echo "============================================================"
echo "  Dashboard:  http://localhost:3456"
echo "  Home:       $NEMONS_HOME"
echo "  Binary:     $NEMOS_BIN"
echo ""
'''

START_SH = r'''#!/usr/bin/env bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NEMOS_BIN="$SCRIPT_DIR/nemos/bin/nemos.js"
[ -f "$NEMOS_BIN" ] || { echo "ERROR: $NEMOS_BIN not found"; exit 1; }
node "$NEMOS_BIN" daemon start
[ $? -eq 0 ] && echo "Dashboard: http://localhost:3456"
'''

STOP_SH = r'''#!/usr/bin/env bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
node "$SCRIPT_DIR/nemos/bin/nemos.js" daemon stop
'''

VERIFY_SH = r'''#!/usr/bin/env bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
node "$SCRIPT_DIR/nemos/bin/nemos.js" verify"
'''

ROOT_PKG = '''{
  "name": "nemos-project",
  "version": "2.0.0",
  "description": "Nemos - transparent orchestration layer for coding agents (final release)",
  "private": true,
  "scripts": {
    "start": "node nemos/bin/nemos.js daemon start",
    "stop": "node nemos/bin/nemos.js daemon stop",
    "health": "node nemos/bin/nemos.js health",
    "verify": "node nemos/bin/nemos.js verify"
  },
  "engines": { "node": ">=18" },
  "license": "MIT"
}
'''

# Write all updated files
print("\n=== Writing v2.0.0 files ===")
files_to_write = {
    "install.bat": INSTALL_BAT,
    "start.bat": START_BAT,
    "stop.bat": STOP_BAT,
    "verify.bat": VERIFY_BAT,
    "dashboard.bat": DASHBOARD_BAT,
    "plugin-install.bat": PLUGIN_INSTALL_BAT,
    "install.sh": INSTALL_SH,
    "start.sh": START_SH,
    "stop.sh": STOP_SH,
    "verify.sh": VERIFY_SH,
    "package.json": ROOT_PKG,
}

for rel, content in files_to_write.items():
    full = project / rel
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding='utf-8')
    print(f"  Wrote: {rel}")

# Make .sh executable
for sh in ["install.sh", "start.sh", "stop.sh", "verify.sh"]:
    (project / sh).chmod(0o755)

# Update version in nemos/package.json
nemos_pkg = project / "nemos" / "package.json"
content = nemos_pkg.read_text()
content = content.replace('"1.3.4"', '"2.0.0"').replace('"1.3.3"', '"2.0.0"')
nemos_pkg.write_text(content)
print("  Updated: nemos/package.json version -> 2.0.0")

# Collect files
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

# Remove old archives
for p in [V2_ZIP, V2_TAR]:
    if p.exists():
        p.unlink()

# Create zip
print(f"\nCreating {V2_ZIP.name}...")
with zipfile.ZipFile(V2_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        zipf.write(full_path, arcname)
print(f"  Created: {V2_ZIP} ({V2_ZIP.stat().st_size} bytes)")

# Create tar.gz
print(f"\nCreating {V2_TAR.name}...")
with tarfile.open(V2_TAR, "w:gz") as tar:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        tar.add(full_path, arcname=arcname)
print(f"  Created: {V2_TAR} ({V2_TAR.stat().st_size} bytes)")

# Cleanup
shutil.rmtree(TEMP_DIR)

# Verify
print("\n=== Verification ===")
with zipfile.ZipFile(V2_ZIP, 'r') as z:
    with z.open('nemos-project/install.bat') as f:
        content = f.read().decode('utf-8')
        if 'npx' in content:
            print(f"  [WARN] install.bat still uses npx")
        else:
            print(f"  OK install.bat uses direct node (no npx)")
        
        if 'nemos\\bin\\nemos.js' in content:
            print(f"  OK install.bat path correct: nemos\\bin\\nemos.js")
        else:
            print(f"  [ERROR] install.bat path incorrect!")
    
    target = 'nemos-project/nemos/bin/nemons.js'
    print(f"  {'OK' if target in z.namelist() else 'ERROR'} {target} exists")

print(f"\n{'='*60}")
print(f"  NEMOS v2.0.0 - FINAL RELEASE READY")
print(f"{'='*60}")
print(f"  Archives:")
print(f"    {V2_ZIP}")
print(f"    {V2_TAR}")
