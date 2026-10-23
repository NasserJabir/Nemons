#!/usr/bin/env node
// ============================================================
// Nemos CLI — entry point (no external deps for command parsing)
// ============================================================
const pkg = require("../package.json");

// Minimal command parser (no commander dependency)
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const flags = {};
for (let i = 2; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const key = a.slice(2).split("=")[0];
    const val = a.includes("=") ? a.split("=")[1] : args[++i] || true;
    flags[key] = val;
  }
}

function showHelp() {
  console.log(`
Nemos v${pkg.version} — transparent orchestration layer for coding agents

Usage:
  nemons daemon <start|stop|restart|status>   Manage the daemon
  nemons health [--detailed]                  Check daemon health
  nemons plugin <install|list|remove>        Manage agent plugins
  nemons intercept <enable|disable|status>    Toggle transparent interception
  nemons verify                               Run end-to-end tests
  nemons install [--npm|--local]              Full installation
  nemons experiences <list|search|clean|stats> Manage stored experiences
  nemons --version                            Show version
  nemons --help                               Show this help
`);
}

if (!command || command === "--help" || command === "-h") {
  showHelp();
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  console.log(`nemos v${pkg.version}`);
  process.exit(0);
}

const VALID = ["daemon", "health", "plugin", "intercept", "verify", "install", "experiences"];
if (!VALID.includes(command)) {
  console.error(`✗ Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}

(async () => {
  try {
    const cmd = require(`../src/commands/${command}`);
    await cmd(subcommand, flags);
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  }
})();
