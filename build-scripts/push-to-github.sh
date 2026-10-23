#!/bin/bash
# ============================================================
# Push Nemos v4.2.1 to GitHub — two repos
#
# Prerequisites:
#   1. Create two empty repos on GitHub (no README, no LICENSE):
#        - https://github.com/new  →  <user>/nemos          (the JS daemon)
#        - https://github.com/new  →  <user>/nemos-core     (the TS core)
#   2. Have either HTTPS credentials cached, or an SSH key
#      registered with GitHub.
#
# Usage:
#   ./push-to-github.sh <your-github-username>
#
# Example:
#   ./push-to-github.sh NasserJabir
# ============================================================
set -e

USER="$1"
if [ -z "$USER" ]; then
  echo "Usage: $0 <github-username>"
  echo "Example: $0 NasserJabir"
  exit 1
fi

DAEMON_DIR="/home/z/my-project/work/nemos-daemon/nemos-project"
CORE_DIR="/home/z/my-project"

echo "============================================================"
echo "  Pushing Nemos v4.2.1 to GitHub as user: $USER"
echo "============================================================"

# ---------- Daemon repo ----------
echo ""
echo "[1/2] Pushing JS daemon → github.com/$USER/nemos"
cd "$DAEMON_DIR"

# Use HTTPS for simplicity (you can switch to git@ if you prefer SSH)
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/nemos.git"
git branch -M main
git push -u origin main

echo "  ✓ JS daemon pushed to https://github.com/$USER/nemos"

# ---------- TS core repo ----------
echo ""
echo "[2/2] Pushing TS core → github.com/$USER/nemos-core"
cd "$CORE_DIR"

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/nemos-core.git"
git branch -M main
git push -u origin main

echo "  ✓ TS core pushed to https://github.com/$USER/nemos-core"

echo ""
echo "============================================================"
echo "  Done!"
echo "  - Daemon:  https://github.com/$USER/nemos"
echo "  - Core:    https://github.com/$USER/nemos-core"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Visit each repo and add a description + topics"
echo "  2. Pin the v4.2.1 release:"
echo "       cd $DAEMON_DIR && git tag v4.2.1 && git push origin v4.2.1"
echo "  3. In the daemon repo, create a Release from the tag and"
echo "     attach /home/z/my-project/download/nemos-project-v4.2.1.tar.gz"
echo "     and nemos-project-v4.2.1.zip"
