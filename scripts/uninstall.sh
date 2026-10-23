#!/usr/bin/env bash
# ============================================================
# Nemons Universal Uninstaller — auto-detects OS
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
NC='\033[0m'
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
err()   { echo -e "${RED}✗ $1${NC}"; }
step()  { echo -e "${CYAN}[nemons] $1${NC}"; }

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

OS=$(detect_os)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ARGS="$@"

echo "============================================================"
echo -e "${CYAN}  Nemons Universal Uninstaller${NC}"
echo "  Detected OS: $OS"
echo "============================================================"
echo ""

case "$OS" in
  linux)
    step "Running Linux uninstaller..."
    bash "$SCRIPT_DIR/linux/uninstall.sh" $ARGS
    ;;
  macos)
    step "Running macOS uninstaller..."
    bash "$SCRIPT_DIR/macos/uninstall.command" $ARGS
    ;;
  windows)
    err "Detected Windows via Git Bash/MSYS"
    echo "  Please use the native Windows uninstaller:"
    echo "    PowerShell:  .\\scripts\\windows\\uninstall.ps1"
    exit 1
    ;;
  *)
    err "Unknown OS: $(uname -s)"
    exit 1
    ;;
esac
