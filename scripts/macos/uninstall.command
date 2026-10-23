#!/usr/bin/env bash
# ============================================================
# Nemons Uninstaller for macOS (.command — double-clickable)
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
step()  { echo -e "${CYAN}[nemons] $1${NC}"; }

REMOVE_DATA=false
if [[ "$1" == "--remove-data" ]]; then REMOVE_DATA=true; fi

echo "============================================================"
echo -e "${CYAN}  Nemons Uninstaller for macOS${NC}"
echo "============================================================"

# ---------- 1. Stop daemon ----------
step "Step 1/4: Stopping daemon..."
if command -v nemons &> /dev/null; then
  nemons daemon stop 2>&1 || warn "Daemon not running"
  ok "Daemon stopped"
else
  warn "nemons CLI not found"
fi

# ---------- 2. Unload launchd agent ----------
step "Step 2/4: Unloading launchd agent..."
PLIST="$HOME/Library/LaunchAgents/com.nemons.daemon.plist"
if [[ -f "$PLIST" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm "$PLIST"
  ok "Removed launchd agent"
else
  ok "No launchd agent found"
fi

# ---------- 3. Unlink CLI ----------
step "Step 3/4: Unlinking CLI..."
SCRIPT_DIR="$( cd "$(dirname "$0")" && pwd )"
CLI_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")/nemons"
if [[ -d "$CLI_DIR" ]]; then
  (cd "$CLI_DIR" && npm unlink -g 2>/dev/null) || warn "Unlink failed"
  ok "CLI unlinked"
else
  # Try npm global uninstall
  npm uninstall -g "@nemons/cli" 2>/dev/null || true
  ok "CLI removed from npm global"
fi

# ---------- 4. Remove data ----------
step "Step 4/4: Removing data directory..."
NEMONS_HOME="$HOME/.nemons"
if [[ "$REMOVE_DATA" == "true" ]]; then
  if [[ -d "$NEMONS_HOME" ]]; then
    rm -rf "$NEMONS_HOME"
    ok "Removed: $NEMONS_HOME"
  else
    ok "Data directory already gone"
  fi
else
  warn "Keeping data directory: $NEMONS_HOME"
  echo "  To remove data too: $0 --remove-data"
fi

# ---------- Done ----------
echo ""
echo "============================================================"
echo -e "${GREEN}✅ Nemons uninstallation complete!${NC}"
echo "============================================================"

# Keep terminal open when double-clicked
if [[ -t 0 ]]; then
  echo ""
  echo "Press any key to close..."
  read -n 1
fi
