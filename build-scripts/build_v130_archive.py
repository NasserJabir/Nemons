#!/usr/bin/env python3
"""
Create v1.3.0 archive - uses npx as primary method (more reliable on Windows)
"""
import zipfile
import tarfile
import os
import shutil
import subprocess
from pathlib import Path

DOWNLOAD = Path("/home/z/my-project/download")
V120_ZIP = DOWNLOAD / "nemos-project-v1.2.0.zip"
V130_ZIP = DOWNLOAD / "nemos-project-v1.3.0.zip"
V130_TAR = DOWNLOAD / "nemos-project-v1.3.0.tar.gz"
TEMP_DIR = DOWNLOAD / "_temp_v130"

# v1.3.0 files - use npx as primary, node as fallback
V130_FILES = {
    "package.json": """{
  "name": "nemos-project",
  "version": "1.3.0",
  "description": "Nemons - transparent orchestration layer for coding agents",
  "private": true,
  "scripts": {
    "start": "node nemos/bin/nemons.js daemon start",
    "stop": "node nemos/bin/nemons.js daemon stop",
    "restart": "node nemos/bin/nemons.js daemon restart",
    "status": "node nemos/bin/nemons.js daemon status",
    "health": "node nemos/bin/nemons.js health",
    "verify": "node nemos/bin/nemons.js verify",
    "setup": "cd nemos && npm install --omit=dev && npm link"
  },
  "engines": { "node": ">=18" },
  "license": "MIT"
}
""",
    "install.bat": r'''@echo off
setlocal enabledelayedexpansion
title Nemons Installer v1.3.0

echo.
echo ============================================================
echo   Nemons Installer v1.3.0
echo ============================================================
echo.

echo [1/7] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   Node.js %%v

echo.
echo [2/7] Checking npm...
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do echo   npm %%v

echo.
echo [3/7] Installing dependencies in nemos\ subdirectory...
pushd "%~dp0nemos"
call npm install --omit=dev
if errorlevel 1 (
    echo [ERROR] npm install failed
    popd
    pause
    exit /b 1
)
popd

echo.
echo [4/7] Linking CLI globally...
pushd "%~dp0nemos"
call npm link
popd

echo.
echo [5/7] Setting up Nemons home directory...
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
echo [6/7] Refreshing PATH for current session...
REM Get npm global bin path and add to PATH
for /f "tokens=*" %%p in ('npm config get prefix') do set NPM_PREFIX=%%p
set "PATH=%NPM_PREFIX%;%PATH%"
echo   Added %NPM_PREFIX% to PATH

echo.
echo [7/7] Starting daemon (using npx for maximum compatibility)...
set NEMONS_HOME=%NEMONS_HOME%

REM Try nemos (if on PATH), then npx, then direct node
where nemos >nul 2>nul
if not errorlevel 1 (
    echo   Trying: nemos daemon start
    call nemos daemon start
    goto :verify
)

echo   'nemos' not in PATH, trying npx...
where npx >nul 2>nul
if not errorlevel 1 (
    echo   Trying: npx nemons daemon start
    call npx nemos daemon start
    goto :verify
)

echo   npx not found, trying direct node invocation...
if exist "%~dp0nemos\bin\nemos.js" (
    echo   Trying: node "%~dp0nemos\bin\nemos.js" daemon start
    node "%~dp0nemos\bin\nemos.js" daemon start
    goto :verify
)

echo   [ERROR] Cannot find a way to start Nemons daemon
pause
exit /b 1

:verify
timeout /t 3 >nul

echo.
echo Verifying installation...
where nemos >nul 2>nul
if not errorlevel 1 (
    call nemos health
) else (
    where npx >nul 2>nul
    if not errorlevel 1 (
        call npx nemons health
    )
)

echo.
echo ============================================================
echo   Installation Complete!
echo ============================================================
echo.
echo   Dashboard: http://localhost:3456
echo   Home:      %NEMONS_HOME%
echo.
echo   Recommended commands (use npx for reliability):
echo     npx nemons daemon start    - Start daemon
echo     npx nemons daemon stop     - Stop daemon
echo     npx nemos health            - Check health
echo     npx nemons verify           - Run tests
echo     npx nemons experiences list - List experiences
echo.
echo   Or use these batch files:
echo     start.bat      - Start daemon
echo     stop.bat       - Stop daemon
echo     verify.bat     - Run tests
echo     dashboard.bat  - Open dashboard
echo.
echo Press any key to open the dashboard...
pause >nul
start http://localhost:3456
''',
    "start.bat": r'''@echo off
title Nemons Daemon - Start
echo Starting Nemons daemon...

REM Try methods in order: nemos > npx > direct node
where nemos >nul 2>nul
if not errorlevel 1 (
    nemos daemon start
    goto :done
)

where npx >nul 2>nul
if not errorlevel 1 (
    echo Trying npx...
    npx nemons daemon start
    goto :done
)

if exist "%~dp0nemos\bin\nemos.js" (
    echo Trying direct node...
    node "%~dp0nemos\bin\nemos.js" daemon start
    goto :done
)

echo [ERROR] Cannot start daemon - run install.bat first
pause
exit /b 1

:done
if not errorlevel 1 (
    echo.
    echo Dashboard: http://localhost:3456
    echo Press any key to open it...
    pause >nul
    start http://localhost:3456
)
''',
    "stop.bat": r'''@echo off
title Nemons Daemon - Stop
echo Stopping Nemons daemon...

where nemos >nul 2>nul
if not errorlevel 1 (
    nemos daemon stop
    goto :done
)

where npx >nul 2>nul
if not errorlevel 1 (
    npx nemons daemon stop
    goto :done
)

if exist "%~dp0nemos\bin\nemos.js" (
    node "%~dp0nemos\bin\nemos.js" daemon stop
    goto :done
)

echo [ERROR] Cannot stop daemon
:done
pause
''',
    "verify.bat": r'''@echo off
title Nemons Verify
echo Running Nemons verification tests...
echo.

where nemos >nul 2>nul
if not errorlevel 1 (
    nemos verify
    goto :done
)

where npx >nul 2>nul
if not errorlevel 1 (
    npx nemons verify
    goto :done
)

if exist "%~dp0nemos\bin\nemos.js" (
    node "%~dp0nemos\bin\nemos.js" verify
)

:done
echo.
pause
''',
    "dashboard.bat": '''@echo off
title Nemons Dashboard
echo Opening Nemons dashboard...
start http://localhost:3456
''',
    "install.sh": r'''#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
NC='\033[0m'
ok()    { echo -e "${GREEN}OK $1${NC}"; }
warn()  { echo -e "${YELLOW}WARN $1${NC}"; }
err()   { echo -e "${RED}FAIL $1${NC}"; }
step()  { echo -e "${CYAN}[nemons] $1${NC}"; }

case "$(uname -s)" in
    Linux*)  OS="linux" ;;
    Darwin*) OS="macos" ;;
    *)       OS="unknown" ;;
esac

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "============================================================"
echo -e "${CYAN}  Nemons Installer v1.3.0${NC}"
echo "  OS: $OS"
echo "============================================================"

step "Step 1/7: Checking Node.js..."
if ! command -v node &> /dev/null; then
    err "Node.js required (>=18)"
    echo "  Install: https://nodejs.org"
    exit 1
fi
NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
    err "Node.js 18+ required (found $NODE_VERSION)"
    exit 1
fi
ok "Node $NODE_VERSION"

step "Step 2/7: Checking npm..."
command -v npm &> /dev/null || { err "npm not found"; exit 1; }
ok "npm $(npm -v)"

step "Step 3/7: Checking npx..."
command -v npx &> /dev/null || { err "npx not found"; exit 1; }
ok "npx available"

step "Step 4/7: Installing dependencies in nemos/ subdirectory..."
CLI_DIR="$SCRIPT_DIR/nemos"
if [ ! -d "$CLI_DIR" ]; then
    err "nemos/ directory not found at: $CLI_DIR"
    exit 1
fi
(cd "$CLI_DIR" && npm install --omit=dev)
ok "Dependencies installed"

step "Step 5/7: Linking CLI globally..."
(cd "$CLI_DIR" && npm link 2>/dev/null) || {
    warn "npm link failed, trying with sudo..."
    (cd "$CLI_DIR" && sudo npm link) || warn "npm link failed - will use npx"
}
ok "CLI linked (or npx available)"

step "Step 6/7: Setting up Nemons home..."
NEMONS_HOME="$HOME/.nemos"
mkdir -p "$NEMONS_HOME"/{config,logs,experiences,evidence,run,audit,context-packs,plugins}
[ -f "$SCRIPT_DIR/config/daemon.yml" ] && cp "$SCRIPT_DIR/config/daemon.yml" "$NEMONS_HOME/config/" && ok "Copied daemon.yml"
[ -f "$SCRIPT_DIR/governance/governance-rules.yml" ] && cp "$SCRIPT_DIR/governance/governance-rules.yml" "$NEMONS_HOME/config/" && ok "Copied governance-rules.yml"
ok "Home: $NEMONS_HOME"

step "Step 7/7: Starting daemon (using npx for compatibility)..."
export NEMONS_HOME="$NEMONS_HOME"

# Try nemos first, then npx, then direct node
if command -v nemons &> /dev/null; then
    nemons daemon start || warn "nemos failed, trying npx..."
    if ! curl -s http://127.0.0.1:3456/health > /dev/null 2>&1; then
        npx nemons daemon start || true
    fi
elif command -v npx &> /dev/null; then
    npx nemons daemon start || warn "npx failed"
else
    node "$CLI_DIR/bin/nemos.js" daemon start || warn "direct node failed"
fi
sleep 2

echo ""
step "Verifying installation..."
if command -v nemons &> /dev/null; then
    nemons health
elif command -v npx &> /dev/null; then
    npx nemons health
else
    node "$CLI_DIR/bin/nemos.js" health
fi

echo ""
echo "============================================================"
echo -e "${GREEN}  Installation Complete!${NC}"
echo "============================================================"
echo ""
echo "  Dashboard: http://localhost:3456"
echo "  Home:      $NEMONS_HOME"
echo ""
echo "  Recommended commands (use npx for reliability):"
echo "    npx nemons daemon start    - Start daemon"
echo "    npx nemons daemon stop     - Stop daemon"
echo "    npx nemons health          - Check health"
echo "    npx nemons verify          - Run tests"
echo ""
''',
    "start.sh": r'''#!/usr/bin/env bash
# Nemons - Start daemon (tries nemos > npx > direct node)
if command -v nemons &> /dev/null; then
    nemons daemon start
elif command -v npx &> /dev/null; then
    echo "Using npx..."
    npx nemons daemon start
else
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    node "$SCRIPT_DIR/nemos/bin/nemos.js" daemon start
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "Dashboard: http://localhost:3456"
    command -v xdg-open &> /dev/null && xdg-open http://localhost:3456
    command -v open &> /dev/null && open http://localhost:3456
fi
''',
    "stop.sh": r'''#!/usr/bin/env bash
if command -v nemons &> /dev/null; then
    nemons daemon stop
elif command -v npx &> /dev/null; then
    npx nemons daemon stop
else
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    node "$SCRIPT_DIR/nemos/bin/nemos.js" daemon stop
fi
''',
    "verify.sh": r'''#!/usr/bin/env bash
if command -v nemons &> /dev/null; then
    nemons verify
elif command -v npx &> /dev/null; then
    npx nemons verify
else
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    node "$SCRIPT_DIR/nemos/bin/nemos.js" verify
fi
''',
    "dashboard.sh": r'''#!/usr/bin/env bash
URL="http://localhost:3456"
echo "Opening: $URL"
command -v xdg-open &> /dev/null && xdg-open "$URL"
command -v open &> /dev/null && open "$URL"
''',
}

# Step 1: Clean up temp dir
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir()

# Step 2: Extract v1.2.0 to temp using subprocess (unzip)
print(f"Extracting {V120_ZIP.name} to temp...")
result = subprocess.run(
    ['unzip', '-q', str(V120_ZIP), '-d', str(TEMP_DIR)],
    capture_output=True, text=True
)
if result.returncode != 0:
    print(f"unzip failed: {result.stderr}")
    exit(1)

project = TEMP_DIR / "nemos-project"
print(f"Project extracted to: {project}")

# Step 3: Add v1.3.0 files
print("\nAdding v1.3.0 files...")
for rel_path, content in V130_FILES.items():
    full = project / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding='utf-8')
    print(f"  Created: {rel_path}")

# Make .sh executable
for sh_file in ["install.sh", "start.sh", "stop.sh", "verify.sh", "dashboard.sh"]:
    full = project / sh_file
    full.chmod(0o755)

# Step 4: List all files
print("\nCollecting all files...")
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

# Step 5: Remove old archives
for p in [V130_ZIP, V130_TAR]:
    if p.exists():
        p.unlink()

# Step 6: Create zip
print(f"\nCreating {V130_ZIP.name}...")
with zipfile.ZipFile(V130_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        zipf.write(full_path, arcname)
print(f"  Created: {V130_ZIP} ({V130_ZIP.stat().st_size} bytes)")

# Step 7: Create tar.gz
print(f"\nCreating {V130_TAR.name}...")
with tarfile.open(V130_TAR, "w:gz") as tar:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        tar.add(full_path, arcname=arcname)
print(f"  Created: {V130_TAR} ({V130_TAR.stat().st_size} bytes)")

# Step 8: Clean up
shutil.rmtree(TEMP_DIR)

# Step 9: Verify
print("\n=== Verification ===")
with zipfile.ZipFile(V130_ZIP, 'r') as z:
    files = z.namelist()
    print(f"Total files in v1.3.0 archive: {len(files)}")
    print("\nRoot-level helper scripts:")
    for f in files:
        if f.startswith('nemos-project/') and f.count('/') == 1 and not f.endswith('/'):
            print(f"  {f}")

print(f"\n✅ v1.3.0 archives ready:")
print(f"   {V130_ZIP}")
print(f"   {V130_TAR}")
