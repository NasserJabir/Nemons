// ============================================================
// Runtime configuration — the single source of truth for WHERE
// the daemon lives (home dir) and WHERE it listens (host/port).
//
// Before this module, server.js, daemon.js (start/stop) and
// verify.js each re-derived the port with different precedence —
// a config-file port made `start` health-poll the wrong port and
// `stop` check the wrong one. Every consumer resolves through
// here now: explicit option > NEMONS_PORT env > config file > 3456.
// ============================================================
const fs = require("fs");
const path = require("path");
const os = require("os");
const yaml = require("js-yaml");

// Canonical home: NEMONS_HOME wins, else ~/.nemons.
// (20+ modules historically defaulted to ~/.nemos while the daemon
// and storage layer used ~/.nemons — data landed in two roots.
// migrateLegacyHome() folds the old root into this one.)
function nemonsHome() {
  return process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");
}

function loadDaemonConfig(configPath) {
  const p = configPath
    || process.env.NEMONS_CONFIG
    || path.join(nemonsHome(), "config", "daemon.yml");
  try {
    return yaml.load(fs.readFileSync(p, "utf8")) || {};
  } catch {
    return {};
  }
}

function resolvePort({ explicit, configPath } = {}) {
  const toPort = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 && n <= 65535 ? n : null;
  };
  return toPort(explicit)
    ?? toPort(process.env.NEMONS_PORT)
    ?? toPort(loadDaemonConfig(configPath).daemon?.port)
    ?? 3456;
}

function resolveHost() {
  return loadDaemonConfig().daemon?.host || "127.0.0.1";
}

// Move data an older version left in the legacy ~/.nemos root into
// the canonical ~/.nemons. Runs only when the daemon uses the
// DEFAULT home (an explicit NEMONS_HOME is respected as-is, never
// migrated into). Idempotent: only moves a dir when the source
// exists and the destination does not.
const LEGACY_DIRS = [
  "kanban", "a2a", "memory", "skills", "provenance", "approvals",
  "cbr", "experiences", "evidence", "context-packs", "audit",
  "logs", "trust", "subagents", "skillbank", "wikiskill",
];

function migrateLegacyHome() {
  if (process.env.NEMONS_HOME) return [];
  const legacy = path.join(os.homedir(), ".nemos");
  const moved = [];
  let entries = [];
  try {
    entries = fs.readdirSync(legacy, { withFileTypes: true });
  } catch {
    return moved; // no legacy root — nothing to do
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !LEGACY_DIRS.includes(entry.name)) continue;
    const src = path.join(legacy, entry.name);
    const dest = path.join(nemonsHome(), entry.name);
    if (fs.existsSync(dest)) continue;
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
      moved.push(entry.name);
    } catch {
      // non-fatal: daemon continues; the legacy copy simply stays put
    }
  }
  if (moved.length > 0) {
    console.log(`[nemons] migrated ${moved.length} dir(s) from legacy ~/.nemos into ${nemonsHome()}: ${moved.join(", ")}`);
  }
  return moved;
}

module.exports = { nemonsHome, loadDaemonConfig, resolvePort, resolveHost, migrateLegacyHome };
