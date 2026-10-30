#!/usr/bin/env bash
# ============================================================
# Nemons Complete Installer
# Supports BOTH:
#   1. Install from local package directory  (default)
#   2. Install from npm after publishing     (--npm flag)
# ============================================================
set -euo pipefail

# Parse args
INSTALL_SOURCE="local"   # default
NPM_FLAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --npm)        INSTALL_SOURCE="npm"; shift ;;
    --local)      INSTALL_SOURCE="local"; shift ;;
    --help|-h)    echo "Usage: $0 [--npm|--local]"; exit 0 ;;
    *)            echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Resolve script's own directory (so it works from anywhere)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PKG_DIR="$(dirname "$SCRIPT_DIR")"        # repo / archive root
# The CLI directory is `nemos/` in the source tree and `nemons-cli/` in the
# packaged archive. This script used to hardcode the packaged name, so
# installing from a checkout always failed with "CLI directory not found".
if [ -d "$PKG_DIR/nemos" ]; then
  CLI_DIR="$PKG_DIR/nemos"
else
  CLI_DIR="$PKG_DIR/nemons-cli"
fi

echo "============================================================"
echo "  Nemons Installer"
echo "  Source: $INSTALL_SOURCE"
echo "============================================================"

# ---------- 1. Pre-flight checks ----------
echo ""
echo "[1/8] Pre-flight checks..."

if ! command -v node &> /dev/null; then
  echo "✗ Node.js required (>=18). Install from https://nodejs.org"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo "✗ Git required."
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ Node.js 18+ required, found $(node -v)"
  exit 1
fi

echo "  ✓ Node $(node -v)"
echo "  ✓ Git $(git --version | head -1)"

# ---------- 2. Install Nemons CLI ----------
echo ""
echo "[2/8] Installing Nemons CLI (source: $INSTALL_SOURCE)..."

if [ "$INSTALL_SOURCE" = "npm" ]; then
  # Install from npm registry (after package is published)
  npm install -g @nemons/cli || {
    echo "  ⚠ npm install failed, trying with sudo..."
    sudo npm install -g @nemons/cli
  }
  echo "  ✓ Installed from npm: $(npm ls -g @nemons/cli 2>/dev/null | grep nemons || echo 'check version')"
else
  # Install from local package directory
  if [ ! -d "$CLI_DIR" ]; then
    echo "  ✗ CLI directory not found: $CLI_DIR"
    echo "    Make sure the nemos/ (or nemons-cli/) directory is in the same package"
    exit 1
  fi
  
  echo "  → Installing dependencies in $CLI_DIR..."
  (cd "$CLI_DIR" && npm install --production)
  
  echo "  → Linking CLI globally (npm link)..."
  if (cd "$CLI_DIR" && npm link 2>/dev/null); then
    echo "  ✓ Linked globally"
  else
    echo "  ⚠ npm link failed (permissions), trying sudo..."
    sudo npm link --prefix "$CLI_DIR" 2>/dev/null || (cd "$CLI_DIR" && sudo npm link)
    echo "  ✓ Linked with sudo"
  fi
fi

# Verify CLI works
if command -v nemons &> /dev/null; then
  echo "  ✓ Nemons CLI: $(nemons --version 2>&1 || echo 'installed')"
else
  echo "  ⚠ 'nemons' not on PATH — adding npm global bin to PATH"
  NPM_BIN=$(npm bin -g 2>/dev/null || npm config get prefix)/bin
  export PATH="$NPM_BIN:$PATH"
  if command -v nemons &> /dev/null; then
    echo "  ✓ Nemons CLI accessible via: $NPM_BIN/nemons"
    echo "    Add to shell: export PATH=\"$NPM_BIN:\$PATH\""
  else
    echo "  ✗ Cannot find 'nemons' command"
    exit 1
  fi
fi

# ---------- 3. Create Nemons home directory ----------
echo ""
echo "[3/8] Creating Nemons home (~/.nemons/)..."
NEMONS_HOME="${HOME}/.nemons"
mkdir -p "$NEMONS_HOME"/{config,context-packs,experiences,evidence,logs,plugins,run,audit}

# Copy default config if not exists
if [ ! -f "$NEMONS_HOME/config/daemon.yml" ]; then
  if [ -f "$PKG_DIR/config/daemon.yml" ]; then
    cp "$PKG_DIR/config/daemon.yml" "$NEMONS_HOME/config/daemon.yml"
    echo "  ✓ Copied daemon.yml"
  fi
fi

if [ ! -f "$NEMONS_HOME/config/governance-rules.yml" ]; then
  if [ -f "$PKG_DIR/governance/governance-rules.yml" ]; then
    cp "$PKG_DIR/governance/governance-rules.yml" "$NEMONS_HOME/config/governance-rules.yml"
    echo "  ✓ Copied governance-rules.yml"
  fi
fi

echo "  ✓ Home: $NEMONS_HOME"

# ---------- 4. Start daemon (using the CLI we just installed) ----------
echo ""
echo "[4/8] Starting Nemons daemon..."

nemons daemon start 2>&1 || {
  echo "  ⚠ Failed to start daemon, retrying..."
  sleep 2
  nemons daemon start 2>&1 || {
    echo "  ✗ Daemon failed to start. Try manually: nemons daemon start"
  }
}

# ---------- 5. Wait for daemon ----------
echo ""
echo "[5/8] Verifying daemon is responsive..."
for i in {1..15}; do
  if nemons health &> /dev/null; then
    echo "  ✓ Daemon healthy"
    break
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    echo "  ⚠ Daemon not responding after 15s"
    echo "    Check: tail -f $NEMONS_HOME/logs/daemon.log"
  fi
done

# ---------- 6. Detect + register coding agents ----------
echo ""
echo "[6/8] Detecting installed coding agents..."

AGENTS_FOUND=()
for cmd in opencode codex claude kimi qoder cline; do
  if command -v "$cmd" &> /dev/null; then
    AGENTS_FOUND+=("$cmd")
    echo "  ✓ Found: $cmd"
  fi
done

if [ ${#AGENTS_FOUND[@]} -eq 0 ]; then
  echo "  ⚠ No coding agents detected. Install at least one (OpenCode, Claude Code, etc.)"
  echo "    After installing, run: nemons plugin install"
else
  echo "  Detected ${#AGENTS_FOUND[@]} agents: ${AGENTS_FOUND[*]}"
fi

# ---------- 7. Install Nemons plugin in each agent ----------
echo ""
echo "[7/8] Installing Nemons plugin in detected agents..."

if [ ${#AGENTS_FOUND[@]} -gt 0 ]; then
  for agent in "${AGENTS_FOUND[@]}"; do
    echo "  → Installing plugin for $agent..."
    # Map binary name to agent key
    case "$agent" in
      claude) agent_key="claude-code" ;;
      *)      agent_key="$agent" ;;
    esac
    nemons plugin install --agent "$agent_key" 2>&1 | sed 's/^/    /' || {
      echo "    ⚠ Failed for $agent"
    }
  done
else
  echo "  Skipping (no agents detected) — run 'nemons plugin install' later"
fi

# ---------- 8. Verify end-to-end ----------
echo ""
echo "[8/8] End-to-end verification..."

nemons verify 2>&1 | sed 's/^/  /' || {
  echo "  ⚠ Verification had issues — run 'nemons verify' for details"
}

# ---------- Done ----------
echo ""
echo "============================================================"
echo "✅ Nemons installation complete! (source: $INSTALL_SOURCE)"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Edit config:        \$EDITOR ~/.nemons/config/daemon.yml"
echo "  2. View dashboard:     open http://localhost:3456"
echo "  3. Check logs:         tail -f ~/.nemons/logs/daemon.log"
echo "  4. List experiences:   nemons experiences list"
echo "  5. Run verification:   nemons verify"
echo ""
if [ ${#AGENTS_FOUND[@]} -gt 0 ]; then
  echo "Test transparent mode:"
echo "  cd your-project"
echo "  ${AGENTS_FOUND[0]}"
echo "  > implement a hello world function"
echo ""
echo "Nemons should auto-trigger on every prompt. 🎉"
else
  echo "Install a coding agent (e.g. OpenCode) and run:"
echo "  nemons plugin install"
fi
