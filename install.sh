#!/usr/bin/env bash
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
