#!/usr/bin/env bash
# ============================================================
# Nemons Installer for macOS (.command — double-clickable in Finder)
# Same logic as install.sh, but with macOS-specific tweaks
# ============================================================
set -e

# Make the script pretty
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
err()   { echo -e "${RED}✗ $1${NC}"; }
step()  { echo -e "${CYAN}[nemons] $1${NC}"; }

# When double-clicked in Finder, cd to script's parent
cd "$(dirname "$0")/../.."

# Resolve paths
SCRIPT_DIR="$( cd "$(dirname "$0")" && pwd )"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CLI_DIR="$PROJECT_ROOT/nemons"

# Install source (default: local)
SOURCE="local"
if [[ "$1" == "--npm" ]]; then SOURCE="npm"; fi

echo "============================================================"
echo -e "${CYAN}  Nemons Installer for macOS${NC}"
echo "  Source: $SOURCE"
echo "============================================================"

# ---------- 1. Pre-flight checks ----------
step "Step 1/8: Pre-flight checks..."

# Check Node.js
if ! command -v node &> /dev/null; then
  err "Node.js required (>=18)"
  echo "  Install via Homebrew: brew install node"
  echo "  Or download from: https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  err "Node.js 18+ required (found $NODE_VERSION)"
  exit 1
fi
ok "Node $NODE_VERSION"

# Check Git (macOS prompts to install Xcode CLI tools)
if ! command -v git &> /dev/null; then
  warn "Git not found — macOS may prompt to install Command Line Tools"
fi

# Check Homebrew
if command -v brew &> /dev/null; then
  ok "Homebrew available"
else
  warn "Homebrew not installed (optional)"
fi

# ---------- 2. Create Nemons home directory ----------
step "Step 2/8: Creating Nemons home (~/.nemons/)..."
NEMONS_HOME="$HOME/.nemons"
mkdir -p "$NEMONS_HOME"/{config,context-packs,experiences,evidence,logs,plugins,run,audit}

# Copy config if not exists
if [[ ! -f "$NEMONS_HOME/config/daemon.yml" ]]; then
  if [[ -f "$PROJECT_ROOT/config/daemon.yml" ]]; then
    cp "$PROJECT_ROOT/config/daemon.yml" "$NEMONS_HOME/config/"
    ok "Copied daemon.yml"
  fi
fi
if [[ ! -f "$NEMONS_HOME/config/governance-rules.yml" ]]; then
  if [[ -f "$PROJECT_ROOT/governance/governance-rules.yml" ]]; then
    cp "$PROJECT_ROOT/governance/governance-rules.yml" "$NEMONS_HOME/config/"
    ok "Copied governance-rules.yml"
  fi
fi
ok "Home: $NEMONS_HOME"

# ---------- 3. Install CLI ----------
step "Step 3/8: Installing Nemons CLI..."
if [[ "$SOURCE" == "npm" ]]; then
  npm install -g @nemons/cli || sudo npm install -g @nemons/cli
  ok "Installed from npm"
else
  echo "  → Installing dependencies..."
  (cd "$CLI_DIR" && npm install --production)
  echo "  → Linking CLI globally..."
  if (cd "$CLI_DIR" && npm link 2>/dev/null); then
    ok "Linked globally"
  else
    sudo npm link --prefix "$CLI_DIR" 2>/dev/null || (cd "$CLI_DIR" && sudo npm link)
    ok "Linked (with sudo)"
  fi
fi

# ---------- 4. Install launchd service ----------
step "Step 4/8: Installing launchd service..."

PLIST_NAME="com.nemons.daemon.plist"
PLIST_SRC="$PROJECT_ROOT/scripts/macos/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"

if [[ -f "$PLIST_SRC" ]]; then
  # Replace USERNAME placeholder
  sed "s|USERNAME|$USER|g" "$PLIST_SRC" > "$PLIST_DST"
  ok "Installed: $PLIST_DST"
else
  warn "launchd plist not found at $PLIST_SRC"
fi

# ---------- 5. Start daemon ----------
step "Step 5/8: Starting daemon..."
nemons daemon start 2>&1 || {
  warn "Start failed, retrying..."
  sleep 2
  nemons daemon start 2>&1
}

# Wait for health
for i in {1..15}; do
  if nemons health &> /dev/null; then
    ok "Daemon healthy"
    break
  fi
  sleep 1
done

# ---------- 6. Detect coding agents ----------
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
  echo "  Install at least one: OpenCode, Claude Code, Codex, etc."
fi

# ---------- 7. Install plugins ----------
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

# ---------- 8. Verify ----------
step "Step 8/8: End-to-end verification..."
nemons verify 2>&1 | sed 's/^/  /' || warn "Verification had issues"

# ---------- Done ----------
echo ""
echo "============================================================"
echo -e "${GREEN}✅ Nemons installation complete! (source: $SOURCE)${NC}"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Edit config:        \$EDITOR ~/.nemons/config/daemon.yml"
echo "  2. View dashboard:     open http://localhost:3456"
echo "  3. Check logs:         tail -f ~/.nemons/logs/daemon.log"
echo "  4. Run verification:   nemons verify"
echo ""
if [[ ${#AGENTS_FOUND[@]} -gt 0 ]]; then
  echo "Test transparent mode:"
  echo "  cd your-project"
  echo "  ${AGENTS_FOUND[0]}"
  echo "  > implement a hello world function"
  echo ""
  echo -e "${GREEN}Nemons should auto-trigger on every prompt. 🎉${NC}"
fi

# Keep terminal open when double-clicked
if [[ -t 0 ]]; then
  echo ""
  echo "Press any key to close..."
  read -n 1
fi
