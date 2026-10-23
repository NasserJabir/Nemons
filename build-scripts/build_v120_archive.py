#!/usr/bin/env python3
"""
Create v1.2.0 archive from v1.1.0 + new helper scripts.
This script:
1. Extracts v1.1.0 archive to a temp location
2. Adds v1.2.0 helper scripts (install.bat, start.bat, etc.)
3. Updates the root package.json
4. Creates v1.2.0 archives (zip + tar.gz)
"""
import zipfile
import tarfile
import os
import shutil
import subprocess
from pathlib import Path

DOWNLOAD = Path("/home/z/my-project/download")
V110_ZIP = DOWNLOAD / "nemons-project-v1.1.0.zip"
V120_ZIP = DOWNLOAD / "nemos-project-v1.2.0.zip"
V120_TAR = DOWNLOAD / "nemos-project-v1.2.0.tar.gz"
TEMP_DIR = DOWNLOAD / "_temp_v120"

# v1.2.0 files to add
V120_FILES = {
    "package.json": """{
  "name": "nemos-project",
  "version": "1.2.0",
  "description": "Nemons - transparent orchestration layer for coding agents",
  "private": true,
  "scripts": {
    "start": "node nemos/bin/nemons.js daemon start",
    "stop": "node nemos/bin/nemons.js daemon stop",
    "restart": "node nemos/bin/nemos.js daemon restart",
    "status": "node nemos/bin/nemons.js daemon status",
    "health": "node nemos/bin/nemos.js health",
    "verify": "node nemos/bin/nemos.js verify",
    "setup": "cd nemos && npm install --omit=dev && npm link"
  },
  "engines": { "node": ">=18" },
  "license": "MIT"
}
""",
    "install.bat": """@echo off
setlocal enabledelayedexpansion
title Nemons Installer v1.2.0

echo.
echo ============================================================
echo   Nemons Installer v1.2.0 - One-Click Windows Installer
echo ============================================================
echo.

echo [1/6] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   Node.js %%v

echo.
echo [2/6] Checking npm...
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do echo   npm %%v

echo.
echo [3/6] Installing dependencies in nemos\\ subdirectory...
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
echo [4/6] Linking CLI globally...
pushd "%~dp0nemos"
call npm link
popd

echo.
echo [5/6] Setting up Nemons home...
set NEMONS_HOME=%USERPROFILE%\\.nemos
if not exist "%NEMONS_HOME%\\config" mkdir "%NEMONS_HOME%\\config"
if not exist "%NEMONS_HOME%\\logs" mkdir "%NEMONS_HOME%\\logs"
if not exist "%NEMONS_HOME%\\experiences" mkdir "%NEMONS_HOME%\\experiences"
if not exist "%NEMONS_HOME%\\evidence" mkdir "%NEMONS_HOME%\\evidence"
if not exist "%NEMONS_HOME%\\run" mkdir "%NEMONS_HOME%\\run"
if not exist "%NEMONS_HOME%\\audit" mkdir "%NEMONS_HOME%\\audit"
if not exist "%NEMONS_HOME%\\context-packs" mkdir "%NEMONS_HOME%\\context-packs"
if not exist "%NEMONS_HOME%\\plugins" mkdir "%NEMONS_HOME%\\plugins"
if exist "%~dp0config\\daemon.yml" copy /y "%~dp0config\\daemon.yml" "%NEMONS_HOME%\\config\\" >nul
if exist "%~dp0governance\\governance-rules.yml" copy /y "%~dp0governance\\governance-rules.yml" "%NEMONS_HOME%\\config\\" >nul
echo   Home: %NEMONS_HOME%

echo.
echo [6/6] Starting daemon...
set NEMONS_HOME=%NEMONS_HOME%
where nemos >nul 2>nul
if errorlevel 1 (
    echo   'nemos' not in PATH yet - using direct invocation
    node "%~dp0nemos\\bin\\nemos.js" daemon start
) else (
    nemos daemon start
)

timeout /t 3 >nul

echo.
echo ============================================================
echo   Installation Complete!
echo ============================================================
echo.
echo   Dashboard: http://localhost:3456
echo   Home:      %NEMONS_HOME%
echo.
echo   IMPORTANT: Open a NEW command prompt for 'nemos' to work.
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
""",
    "start.bat": """@echo off
title Nemons Daemon - Start
echo Starting Nemons daemon...
where nemos >nul 2>nul
if errorlevel 1 (
    echo 'nemos' not in PATH - using direct invocation
    node "%~dp0nemos\\bin\\nemos.js" daemon start
) else (
    nemos daemon start
)
if errorlevel 0 (
    echo.
    echo Dashboard: http://localhost:3456
    echo Press any key to open it...
    pause >nul
    start http://localhost:3456
)
""",
    "stop.bat": """@echo off
title Nemons Daemon - Stop
echo Stopping Nemons daemon...
where nemos >nul 2>nul
if errorlevel 1 (
    node "%~dp0nemos\\bin\\nemos.js" daemon stop
) else (
    nemos daemon stop
)
pause
""",
    "verify.bat": """@echo off
title Nemons Verify
echo Running Nemons verification tests...
echo.
where nemos >nul 2>nul
if errorlevel 1 (
    node "%~dp0nemos\\bin\\nemos.js" verify
) else (
    nemos verify
)
echo.
pause
""",
    "dashboard.bat": """@echo off
title Nemons Dashboard
echo Opening Nemons dashboard...
start http://localhost:3456
""",
    "install.sh": """#!/usr/bin/env bash
set -e
GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; RED='\\033[0;31m'; CYAN='\\033[0;36m'
NC='\\033[0m'
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
PROJECT_ROOT="$SCRIPT_DIR"

echo "============================================================"
echo -e "${CYAN}  Nemons Installer v1.2.0${NC}"
echo "  OS: $OS"
echo "============================================================"

step "Step 1/6: Checking Node.js..."
if ! command -v node &> /dev/null; then
    err "Node.js required (>=18)"
    echo "  Install: https://nodejs.org"
    exit 1
fi
NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\\([0-9]*\\).*/\\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
    err "Node.js 18+ required (found $NODE_VERSION)"
    exit 1
fi
ok "Node $NODE_VERSION"

step "Step 2/6: Checking npm..."
command -v npm &> /dev/null || { err "npm not found"; exit 1; }
ok "npm $(npm -v)"

step "Step 3/6: Installing dependencies in nemos/ subdirectory..."
CLI_DIR="$PROJECT_ROOT/nemos"
if [ ! -d "$CLI_DIR" ]; then
    err "nemos/ directory not found at: $CLI_DIR"
    exit 1
fi
(cd "$CLI_DIR" && npm install --omit=dev)
ok "Dependencies installed"

step "Step 4/6: Linking CLI globally..."
(cd "$CLI_DIR" && npm link 2>/dev/null) || {
    warn "npm link failed, trying with sudo..."
    (cd "$CLI_DIR" && sudo npm link)
}
ok "CLI linked"

step "Step 5/6: Setting up Nemons home..."
NEMONS_HOME="$HOME/.nemos"
mkdir -p "$NEMONS_HOME"/{config,logs,experiences,evidence,run,audit,context-packs,plugins}
[ -f "$PROJECT_ROOT/config/daemon.yml" ] && cp "$PROJECT_ROOT/config/daemon.yml" "$NEMONS_HOME/config/" && ok "Copied daemon.yml"
[ -f "$PROJECT_ROOT/governance/governance-rules.yml" ] && cp "$PROJECT_ROOT/governance/governance-rules.yml" "$NEMONS_HOME/config/" && ok "Copied governance-rules.yml"
ok "Home: $NEMONS_HOME"

step "Step 6/6: Starting daemon..."
export NEMONS_HOME="$NEMONS_HOME"
if command -v nemons &> /dev/null; then
    nemons daemon start || warn "Daemon start had issue"
else
    warn "'nemos' not in PATH - using direct invocation"
    node "$CLI_DIR/bin/nemos.js" daemon start || warn "Daemon start had issue"
fi
sleep 2

echo ""
step "Verifying installation..."
if command -v nemons &> /dev/null; then
    nemons health
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
if ! command -v nemons &> /dev/null; then
    echo -e "${YELLOW}  IMPORTANT:${NC} Open a NEW terminal for 'nemos' to be on PATH"
fi
echo ""
echo "  Commands:"
echo "    nemos daemon start    - Start daemon"
echo "    nemos daemon stop     - Stop daemon"
echo "    nemos health          - Check health"
echo "    nemos verify          - Run tests"
""",
    "start.sh": """#!/usr/bin/env bash
if command -v nemons &> /dev/null; then
    nemons daemon start
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
""",
    "stop.sh": """#!/usr/bin/env bash
if command -v nemons &> /dev/null; then
    nemons daemon stop
else
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    node "$SCRIPT_DIR/nemos/bin/nemos.js" daemon stop
fi
""",
    "verify.sh": """#!/usr/bin/env bash
if command -v nemons &> /dev/null; then
    nemons verify
else
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    node "$SCRIPT_DIR/nemos/bin/nemos.js" verify
fi
""",
    "dashboard.sh": """#!/usr/bin/env bash
URL="http://localhost:3456"
command -v xdg-open &> /dev/null && xdg-open "$URL"
command -v open &> /dev/null && open "$URL"
echo "Open this URL: $URL"
""",
}

# Step 1: Clean up temp dir
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir()

# Step 2: Extract v1.1.0 to temp using subprocess (unzip)
print(f"Extracting {V110_ZIP.name} to temp...")
result = subprocess.run(
    ['unzip', '-q', str(V110_ZIP), '-d', str(TEMP_DIR)],
    capture_output=True, text=True
)
if result.returncode != 0:
    print(f"unzip failed: {result.stderr}")
    # Fallback to Python zipfile
    try:
        with zipfile.ZipFile(str(V110_ZIP), 'r') as z:
            z.extractall(str(TEMP_DIR))
    except Exception as e:
        print(f"Python zipfile failed: {e}")
        exit(1)

project = TEMP_DIR / "nemos-project"
print(f"Project extracted to: {project}")
print(f"Original files: {len(list(project.iterdir()))}")

# Step 3: Add v1.2.0 files
print("\nAdding v1.2.0 files...")
for rel_path, content in V120_FILES.items():
    full = project / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding='utf-8')
    print(f"  Created: {rel_path}")

# Make .sh executable
for sh_file in ["install.sh", "start.sh", "stop.sh", "verify.sh", "dashboard.sh"]:
    full = project / sh_file
    full.chmod(0o755)

# Step 4: List all files
print("\nAll files in v1.2.0:")
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
for p in [V120_ZIP, V120_TAR]:
    if p.exists():
        p.unlink()
        print(f"Removed old: {p.name}")

# Step 6: Create zip
print(f"\nCreating {V120_ZIP.name}...")
with zipfile.ZipFile(V120_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        zipf.write(full_path, arcname)
print(f"  Created: {V120_ZIP} ({V120_ZIP.stat().st_size} bytes)")

# Step 7: Create tar.gz
print(f"\nCreating {V120_TAR.name}...")
with tarfile.open(V120_TAR, "w:gz") as tar:
    for full_path, rel_path in all_files:
        arcname = os.path.join("nemos-project", rel_path)
        tar.add(full_path, arcname=arcname)
print(f"  Created: {V120_TAR} ({V120_TAR.stat().st_size} bytes)")

# Step 8: Clean up temp
shutil.rmtree(TEMP_DIR)
print(f"\nCleaned up temp directory")

# Step 9: Verify
print("\n=== Verification ===")
with zipfile.ZipFile(V120_ZIP, 'r') as z:
    names = z.namelist()
    print(f"Zip contains {len(names)} entries")
    print("\nRoot-level files in archive:")
    for n in names:
        if n.count('/') <= 1 and n != "nemos-project/":
            print(f"  {n}")

print(f"\n✅ v1.2.0 archives ready:")
print(f"   {V120_ZIP}")
print(f"   {V120_TAR}")
