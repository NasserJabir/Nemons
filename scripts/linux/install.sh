#!/usr/bin/env bash
# ============================================================
# Nemons Installer for Linux (bash)
# Supports: Debian/Ubuntu, RHEL/Fedora, Arch, Alpine
# ============================================================
set -euo pipefail

# Pretty output
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
NC='\033[0m'
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
err()   { echo -e "${RED}✗ $1${NC}"; }
step()  { echo -e "${CYAN}[nemons] $1${NC}"; }

# Detect distro
detect_distro() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    echo "$ID"
  elif command -v apt &> /dev/null; then echo "debian"
  elif command -v dnf &> /dev/null; then echo "fedora"
  elif command -v pacman &> /dev/null; then echo "arch"
  elif command -v apk &> /dev/null; then echo "alpine"
  else echo "unknown"
  fi
}

INSTALL_SOURCE="local"
if [[ "${1:-}" == "--npm" ]]; then INSTALL_SOURCE="npm"; fi
if [[ "${1:-}" == "--local" ]]; then INSTALL_SOURCE="local"; fi

DISTRO=$(detect_distro)

echo "============================================================"
echo -e "${CYAN}  Nemons Installer for Linux${NC}"
echo "  Source: $INSTALL_SOURCE"
echo "  Distro: $DISTRO"
echo "============================================================"

# ---------- 1. Pre-flight checks ----------
step "Step 1/8: Pre-flight checks..."

# Check Node.js
if ! command -v node &> /dev/null; then
  err "Node.js required (>=18)"
  echo "  Install for $DISTRO:"
  case "$DISTRO" in
    debian|ubuntu)
      echo "    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
      echo "    sudo apt install -y nodejs"
      ;;
    fedora|rhel|centos)
      echo "    sudo dnf install -y nodejs npm"
      ;;
    arch)
      echo "    sudo pacman -S nodejs npm"
      ;;
    alpine)
      echo "    sudo apk add nodejs npm"
      ;;
    *)
      echo "    See: https://nodejs.org/en/download/package-manager/"
      ;;
  esac
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  err "Node.js 18+ required (found $(node -v))"
  exit 1
fi
ok "Node $(node -v)"

# Check Git
if ! command -v git &> /dev/null; then
  warn "Git not found — installing..."
  case "$DISTRO" in
    debian|ubuntu) sudo apt install -y git ;;
    fedora|rhel)   sudo dnf install -y git ;;
    arch)          sudo pacman -S --noconfirm git ;;
    alpine)        sudo apk add git ;;
  esac
fi
ok "Git $(git --version | head -1 | awk '{print $3}')"

# Check curl
if ! command -v curl &> /dev/null; then
  warn "curl not found — installing..."
  case "$DISTRO" in
    debian|ubuntu) sudo apt install -y curl ;;
    fedora|rhel)   sudo dnf install -y curl ;;
    arch)          sudo pacman -S --noconfirm curl ;;
    alpine)        sudo apk add curl ;;
  esac
fi

# ---------- 2. Resolve paths ----------
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CLI_DIR="$PROJECT_ROOT/nemons"

# ---------- 3. Create Nemons home ----------
step "Step 2/8: Creating Nemons home (~/.nemons/)..."
NEMONS_HOME="$HOME/.nemons"
mkdir -p "$NEMONS_HOME"/{config,context-packs,experiences,evidence,logs,plugins,run,audit}

# Copy configs
[[ ! -f "$NEMONS_HOME/config/daemon.yml" && -f "$PROJECT_ROOT/config/daemon.yml" ]] && cp "$PROJECT_ROOT/config/daemon.yml" "$NEMONS_HOME/config/" && ok "Copied daemon.yml"
[[ ! -f "$NEMONS_HOME/config/governance-rules.yml" && -f "$PROJECT_ROOT/governance/governance-rules.yml" ]] && cp "$PROJECT_ROOT/governance/governance-rules.yml" "$NEMONS_HOME/config/" && ok "Copied governance-rules.yml"

ok "Home: $NEMONS_HOME"

# ---------- 4. Install CLI ----------
step "Step 3/8: Installing Nemons CLI (source: $INSTALL_SOURCE)..."

if [[ "$INSTALL_SOURCE" == "npm" ]]; then
  npm install -g @nemons/cli || sudo npm install -g @nemons/cli
  ok "Installed from npm"
else
  if [[ ! -d "$CLI_DIR" ]]; then
    err "CLI directory not found: $CLI_DIR"
    exit 1
  fi
  
  echo "  → Installing dependencies in $CLI_DIR..."
  (cd "$CLI_DIR" && npm install --production)
  
  echo "  → Linking CLI globally (npm link)..."
  if (cd "$CLI_DIR" && npm link 2>/dev/null); then
    ok "Linked globally"
  else
    warn "npm link failed (permissions), trying sudo..."
    sudo npm link --prefix "$CLI_DIR" 2>/dev/null || (cd "$CLI_DIR" && sudo npm link)
    ok "Linked with sudo"
  fi
fi

# Verify CLI
if command -v nemons &> /dev/null; then
  ok "Nemons CLI: $(nemons --version 2>&1 || echo 'installed')"
else
  NPM_BIN=$(npm bin -g 2>/dev/null || npm config get prefix)/bin
  export PATH="$NPM_BIN:$PATH"
  if command -v nemons &> /dev/null; then
    ok "Nemons CLI accessible via: $NPM_BIN/nemons"
    warn "Add to ~/.bashrc: export PATH=\"$NPM_BIN:\$PATH\""
  else
    err "Cannot find 'nemons' command"
    exit 1
  fi
fi

# ---------- 5. Install systemd service ----------
step "Step 4/8: Installing systemd service..."

SERVICE_SRC="$PROJECT_ROOT/scripts/linux/nemons-daemon.service"
SERVICE_DST="/etc/systemd/system/nemons-daemon.service"

if [[ -f "$SERVICE_SRC" ]] && command -v systemctl &> /dev/null; then
  sudo cp "$SERVICE_SRC" "$SERVICE_DST"
  # Replace %i with current user
  sudo sed -i "s|%i|$USER|g" "$SERVICE_DST"
  sudo systemctl daemon-reload
  sudo systemctl enable nemons-daemon
  ok "systemd service installed"
else
  warn "systemd not available — daemon will run as background process"
fi

# ---------- 6. Start daemon ----------
step "Step 5/8: Starting daemon..."

if command -v systemctl &> /dev/null && [[ -f "$SERVICE_DST" ]]; then
  sudo systemctl start nemons-daemon
  ok "Daemon started via systemd"
else
  nemons daemon start 2>&1 || warn "Start failed"
fi

# Wait for health
for i in {1..15}; do
  if nemons health &> /dev/null; then
    ok "Daemon healthy"
    break
  fi
  sleep 1
done

# ---------- 7. Detect coding agents ----------
step "Step 6/8: Detecting installed coding agents..."

AGENTS_FOUND=()
for cmd in opencode codex claude kimi qodercli cline; do
  if command -v "$cmd" &> /dev/null; then
    AGENTS_FOUND+=("$cmd")
    ok "Found: $cmd"
  fi
done

if [[ ${#AGENTS_FOUND[@]} -eq 0 ]]; then
  warn "No coding agents detected"
  echo "  Install one: OpenCode, Claude Code, Codex, etc."
fi

# ---------- 8. Install plugins ----------
step "Step 7/8: Installing Nemons plugins..."
if [[ ${#AGENTS_FOUND[@]} -gt 0 ]]; then
  for agent in "${AGENTS_FOUND[@]}"; do
    case "$agent" in
      claude) agent_key="claude-code" ;;
      qodercli) agent_key="qoder" ;;
      *) agent_key="$agent" ;;
    esac
    echo "  → Installing plugin for $agent_key..."
    nemons plugin install --agent "$agent_key" 2>&1 | sed 's/^/    /' || warn "Failed for $agent"
  done
fi

# ---------- Verify ----------
step "Step 8/8: End-to-end verification..."
nemons verify 2>&1 | sed 's/^/  /' || warn "Verification had issues"

# ---------- Done ----------
echo ""
echo "============================================================"
echo -e "${GREEN}✅ Nemons installation complete! (source: $INSTALL_SOURCE)${NC}"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Edit config:        \$EDITOR ~/.nemons/config/daemon.yml"
echo "  2. View dashboard:     open http://localhost:3456"
echo "  3. Check logs:         tail -f ~/.nemons/logs/daemon.log"
echo "  4. Service status:     sudo systemctl status nemons-daemon"
echo "  5. Run verification:   nemons verify"
echo ""
if [[ ${#AGENTS_FOUND[@]} -gt 0 ]]; then
  echo "Test transparent mode:"
  echo "  cd your-project"
  echo "  ${AGENTS_FOUND[0]}"
  echo "  > implement a hello world function"
  echo ""
  echo -e "${GREEN}Nemons should auto-trigger on every prompt. 🎉${NC}"
fi
