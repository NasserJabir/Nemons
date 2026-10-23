#!/usr/bin/env bash
URL="http://localhost:3456"
echo "Opening: $URL"
command -v xdg-open &> /dev/null && xdg-open "$URL"
command -v open &> /dev/null && open "$URL"
