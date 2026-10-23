#!/usr/bin/env bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NEMOS_BIN="$SCRIPT_DIR/nemos/bin/nemos.js"
[ -f "$NEMOS_BIN" ] || { echo "ERROR: $NEMOS_BIN not found"; exit 1; }
node "$NEMOS_BIN" daemon start
[ $? -eq 0 ] && echo "Dashboard: http://localhost:3456"
