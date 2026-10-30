#!/usr/bin/env node
// ============================================================
// Legacy entry point. The published CLI is `nemons`
// (package.json "bin" -> bin/nemons.js); the root launcher scripts
// (start.sh, stop.bat, install.*, verify.*, package.json scripts) still
// call this path, so it delegates instead of keeping a second command
// parser. The copy here had already diverged: it missed the "a bare flag
// followed by another flag is boolean" fix and swallowed `--port` as the
// value of `--no-doctor`.
// ============================================================
require("./nemons.js");
