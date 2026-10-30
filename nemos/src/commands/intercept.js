// ============================================================
// nemons intercept enable|disable|status
// Writes `interception.targets[].intercept` in daemon.yml. This is prompt
// SCREENING config, consumed inside /analyze — nothing here sits between the
// agent and the model, and there is no reload channel (see reportReload).
// ============================================================
const yaml = require("js-yaml");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { resolvePort } = require("../utils/runtime-config");

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");
const CONFIG_PATH = path.join(NEMONS_HOME, "config", "daemon.yml");

module.exports = async function (action, opts) {
  let config;
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    config = yaml.load(raw);
  } catch {
    console.error(`✗ Config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }

  if (!config.interception || !config.interception.targets) {
    console.error("✗ No interception.targets in config");
    process.exit(1);
  }

  switch (action) {
    case "enable": {
      const targets = config.interception.targets;
      let count = 0;
      for (const t of targets) {
        if (opts.all || (opts.agent && t.adapter === opts.agent)) {
          t.intercept = true;
          count++;
        }
      }
      await fs.writeFile(CONFIG_PATH, yaml.dump(config));
      console.log(`✓ Screening enabled for ${count} adapter(s) in ${CONFIG_PATH}`);
      await reportReload();
      break;
    }

    case "disable": {
      const targets = config.interception.targets;
      let count = 0;
      for (const t of targets) {
        if (opts.all || (opts.agent && t.adapter === opts.agent)) {
          t.intercept = false;
          count++;
        }
      }
      await fs.writeFile(CONFIG_PATH, yaml.dump(config));
      console.log(`✓ Screening disabled for ${count} adapter(s) in ${CONFIG_PATH}`);
      await reportReload();
      break;
    }

    case "status": {
      console.log("[nemons] Prompt-screening config (interception.targets):");
      for (const t of config.interception.targets) {
        const status = t.intercept ? "✓ enabled" : "✗ disabled";
        console.log(`  ${t.adapter.padEnd(15)} ${status}`);
      }
      console.log("  This decides which /analyze calls the daemon screens out;");
      console.log("  it does not put the daemon in the model's path.");
      break;
    }

    default:
      console.error(`Unknown action: ${action}. Use enable|disable|status`);
      process.exit(1);
  }
};

async function reportReload() {
  // server.js calls loadDaemonConfig() once at startup, so writing daemon.yml
  // does not change a running daemon. The previous `hotReload()` fetched
  // /health and printed "Daemon notified (config will reload on next
  // request)" — nothing was notified. This checks reachability on the port the
  // CLI actually uses and says what has to happen next.
  const base = `http://127.0.0.1:${resolvePort()}`;
  try {
    await fetch(`${base}/health`);
    console.log(`  ⚠ A daemon is running at ${base} and loaded its config at startup.`);
    console.log("    Run `nemons daemon restart` for this change to take effect.");
  } catch {
    console.log(`  · No daemon at ${base} — the file is written and applies at next start.`);
  }
}
