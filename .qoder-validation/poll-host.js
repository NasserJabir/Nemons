// Poll the three host-side signals that separate "saved" from "used by Qoder".
// Read-only: prints config hashes, the IDE-written tool cache, and every MCP
// request the daemon actually received. No secret values are printed.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const q = require("../nemos/src/utils/qoder-host");
const HOME = q.qoderHome();
const DERIVED = path.join(process.env.APPDATA, "Qoder", "SharedClientCache", "extension", "local", "mcp.json");
const ACCESS = path.join(process.env.NEMONS_HOME || path.join(__dirname, "nemons-home"), "logs", "mcp-access.log");

const md5 = (p) => (fs.existsSync(p) ? crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex") : "missing");

const live = md5(q.qoderConfigPath(HOME));
const derived = (() => {
  try {
    return JSON.parse(fs.readFileSync(DERIVED, "utf8")).userConfigMD5 || null;
  } catch {
    return "unreadable";
  }
})();
console.log(`config md5        : ${live}`);
console.log(`IDE derived md5   : ${derived}  -> re-read: ${derived === live}`);

const rt = q.readRuntimeDiscovery({ name: "nemons" });
console.log(`host tool cache   : discovered=${rt.discovered} toolCount=${rt.toolCount ?? "-"} tools=${JSON.stringify(rt.tools || [])}`);

console.log("daemon /mcp traffic:");
if (fs.existsSync(ACCESS)) {
  for (const line of fs.readFileSync(ACCESS, "utf8").trim().split("\n")) {
    const m = JSON.parse(line);
    console.log(`  ${m.ts} ua=${m.user_agent} ${m.method}${m.tool ? " " + m.tool : ""} -> ${m.outcome}`);
  }
} else {
  console.log("  (none — the daemon has received zero POST /mcp messages)");
}
