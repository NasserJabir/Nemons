#!/usr/bin/env bash
# Honour NEMONS_PORT: the daemon resolves its port from the environment, then
# config/daemon.yml, then 3456. A hardcoded 3456 opened the wrong page whenever
# the port had been moved.
PORT="${NEMONS_PORT:-3456}"
URL="http://localhost:${PORT}"
echo "Opening: $URL"
command -v xdg-open &> /dev/null && xdg-open "$URL"
command -v open &> /dev/null && open "$URL"
