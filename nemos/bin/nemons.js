#!/usr/bin/env node
// ============================================================
// Nemons CLI — entry point (no external deps for command parsing)
// Published as the `nemons` command by package.json "bin".
// ============================================================
const pkg = require("../package.json");

// Minimal command parser (no commander dependency)
const args = process.argv.slice(2);
const command = args[0];
// `nemons health --detailed` has no subcommand: a leading dash means an
// option, not a positional. Passing it through as `subcommand` used to
// (a) hand command modules a flag string where they expected an action and
// (b) drop the flag, since the parse loop below started after it.
const subcommand = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
const flags = {};
for (let i = subcommand === undefined ? 1 : 2; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const key = a.slice(2).split("=")[0];
    const next = args[i + 1];
    // A bare flag followed by another flag is boolean. Swallowing "--port" as
    // the value of "--no-doctor" used to silently drop the next option.
    const val = a.includes("=")
      ? a.split("=")[1]
      : (next !== undefined && !next.startsWith("--") ? args[++i] : true);
    flags[key] = val;
  }
}

function showHelp() {
  console.log(`
Nemons v${pkg.version} — governed context and evidence service for coding agents.
It is not in the model's path: a host adapter (or the model, via MCP) calls it.

Usage:
  nemons daemon <start|stop|restart|status>   Manage the daemon
  nemons health [--detailed]                  Check daemon health
  nemons plugin <install|list|remove> [--agent <name>]  Manage host adapters
                                        [--home <host dir>] [--port <daemon port>]
                                        [--no-doctor]
  nemons intercept <enable|disable|status>    Toggle prompt screening (config only)
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
  console.log(`nemons v${pkg.version}`);
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
    if (process.env.NEMONS_DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
})();
