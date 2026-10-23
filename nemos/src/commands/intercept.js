// ============================================================
// nemons intercept enable|disable|status
// ============================================================
const yaml = require("js-yaml");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

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
      console.log(`✓ Enabled interception for ${count} adapter(s)`);
      await hotReload();
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
      console.log(`✓ Disabled interception for ${count} adapter(s)`);
      console.log("  ⚠ Subsequent prompts will go directly to the agent");
      await hotReload();
      break;
    }

    case "status": {
      console.log("[nemons] Interception status:");
      for (const t of config.interception.targets) {
        const status = t.intercept ? "✓ enabled" : "✗ disabled";
        console.log(`  ${t.adapter.padEnd(15)} ${status}`);
      }
      break;
    }

    default:
      console.error(`Unknown action: ${action}. Use enable|disable|status`);
      process.exit(1);
  }
};

async function hotReload() {
  // Signal daemon to reload config
  try {
    await fetch("http://127.0.0.1:3456/health");
    console.log("  ✓ Daemon notified (config will reload on next request)");
  } catch {
    console.log("  ⚠ Daemon not running — start with 'nemons daemon start'");
  }
}
