#!/usr/bin/env bash
# ============================================================
# Nemons Uninstaller for Linux (bash)
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
NC='\033[0m'
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
step()  { echo -e "${CYAN}[nemons] $1${NC}"; }

REMOVE_DATA=false
if [[ "${1:-}" == "--remove-data" ]]; then REMOVE_DATA=true; fi

echo "============================================================"
echo -e "${CYAN}  Nemons Uninstaller for Linux${NC}"
echo "============================================================"

# ---------- 1. Stop daemon ----------
step "Step 1/4: Stopping daemon..."

if command -v systemctl &> /dev/null; then
  if systemctl is-active --quiet nemons-daemon 2>/dev/null; then
    sudo systemctl stop nemons-daemon
    ok "Daemon stopped (systemd)"
  else
    ok "Daemon not running (systemd)"
  fi
else
  if command -v nemons &> /dev/null; then
    nemons daemon stop 2>&1 || warn "Not running"
    ok "Daemon stopped"
  fi
fi

# ---------- 2. Remove systemd service ----------
step "Step 2/4: Removing systemd service..."

SERVICE_FILE="/etc/systemd/system/nemons-daemon.service"
if [[ -f "$SERVICE_FILE" ]]; then
  sudo systemctl disable nemons-daemon 2>/dev/null || true
  sudo rm "$SERVICE_FILE"
  sudo systemctl daemon-reload
  ok "Removed: $SERVICE_FILE"
else
  ok "No systemd service found"
fi

# ---------- 3. Unlink CLI ----------
step "Step 3/4: Unlinking CLI..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CLI_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")/nemons"

if [[ -d "$CLI_DIR" ]]; then
  (cd "$CLI_DIR" && npm unlink -g 2>/dev/null) || warn "Unlink failed"
  ok "CLI unlinked"
else
  npm uninstall -g "@nemons/cli" 2>/dev/null || true
  ok "CLI removed"
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
