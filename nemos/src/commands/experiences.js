// ============================================================
// nemons experiences list|search|clean|stats
// ============================================================
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");
const EXPS_DIR = path.join(NEMONS_HOME, "experiences");

module.exports = async function (action, opts) {
  switch (action) {
    case "list": {
      const limit = parseInt(opts.limit || "10");
      try {
        const files = await fs.readdir(EXPS_DIR);
        console.log(`[nemons] ${files.length} experiences total (showing ${Math.min(limit, files.length)}):\n`);
        for (const file of files.slice(-limit).reverse()) {
          try {
            const raw = await fs.readFile(path.join(EXPS_DIR, file), "utf8");
            const exp = JSON.parse(raw);
            console.log(`  ${exp.id}`);
            console.log(`    timestamp: ${exp.timestamp}`);
            if (exp.prompt) {
              console.log(`    prompt: ${exp.prompt.slice(0, 80)}...`);
            }
            console.log("");
          } catch {}
        }
      } catch {
        console.log("No experiences stored yet");
      }
      break;
    }

    case "search": {
      const query = opts.query || opts.skill || "";
      if (!query) {
        console.error("✗ Provide search query (--query or --skill)");
        process.exit(1);
      }
      try {
        const files = await fs.readdir(EXPS_DIR);
        const matches = [];
        for (const file of files) {
          try {
            const raw = await fs.readFile(path.join(EXPS_DIR, file), "utf8");
            const exp = JSON.parse(raw);
            const text = JSON.stringify(exp).toLowerCase();
            if (text.includes(query.toLowerCase())) {
              matches.push(exp);
            }
          } catch {}
        }
        console.log(`[nemons] Found ${matches.length} matching experiences:`);
        for (const m of matches) {
          console.log(`  ${m.id} — ${m.timestamp}`);
        }
      } catch {
        console.log("No experiences to search");
      }
      break;
    }

    case "clean": {
      const maxAge = parseInt(opts.maxAge || "180"); // days
      const cutoff = Date.now() - maxAge * 86400 * 1000;
      let removed = 0;
      try {
        const files = await fs.readdir(EXPS_DIR);
        for (const file of files) {
          try {
            const filePath = path.join(EXPS_DIR, file);
            const stat = await fs.stat(filePath);
            if (stat.mtimeMs < cutoff) {
              await fs.unlink(filePath);
              removed++;
            }
          } catch {}
        }
        console.log(`✓ Removed ${removed} experiences older than ${maxAge} days`);
      } catch (err) {
        console.error(`✗ Cleanup failed: ${err.message}`);
      }
      break;
    }

    case "stats": {
      try {
        const files = await fs.readdir(EXPS_DIR);
        let total = files.length;
        let byAdapter = {};
        let byDomain = {};
        let oldest = null, newest = null;

        for (const file of files) {
          try {
            const raw = await fs.readFile(path.join(EXPS_DIR, file), "utf8");
            const exp = JSON.parse(raw);
            const ts = new Date(exp.timestamp);
            if (!oldest || ts < oldest) oldest = ts;
            if (!newest || ts > newest) newest = ts;

            if (exp.adapter) byAdapter[exp.adapter] = (byAdapter[exp.adapter] || 0) + 1;
            if (exp.domain) byDomain[exp.domain] = (byDomain[exp.domain] || 0) + 1;
          } catch {}
        }

        console.log("[nemons] Experience Statistics");
        console.log("============================");
        console.log(`  Total: ${total}`);
        if (oldest && newest) {
          console.log(`  Oldest: ${oldest.toISOString()}`);
          console.log(`  Newest: ${newest.toISOString()}`);
        }
        if (Object.keys(byAdapter).length > 0) {
          console.log("\n  By adapter:");
          for (const [a, c] of Object.entries(byAdapter)) {
            console.log(`    ${a.padEnd(15)} ${c}`);
          }
        }
        if (Object.keys(byDomain).length > 0) {
          console.log("\n  By domain:");
          for (const [d, c] of Object.entries(byDomain)) {
            console.log(`    ${d.padEnd(15)} ${c}`);
          }
        }
      } catch {
        console.log("No experiences stored yet");
      }
      break;
    }

    default:
      console.error(`Unknown action: ${action}. Use list|search|clean|stats`);
      process.exit(1);
  }
};
