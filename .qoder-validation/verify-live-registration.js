// Read-only verification of the live Qoder registration.
// Prints no secret values, only lengths and structural comparisons.
const fs = require("fs");
const path = require("path");

const BEFORE = path.join(__dirname, "mcp.json.before");
const TARGET = path.join(process.env.USERPROFILE, ".qoder", "mcp.json");

const before = fs.readFileSync(BEFORE, "utf8");
const after = fs.readFileSync(TARGET, "utf8");
const b = JSON.parse(before);
const a = JSON.parse(after);

console.log("bytes:", before.length, "->", after.length);
console.log("2-space indent preserved:", /\n {2}"mcpServers"/.test(after));
console.log("servers before:", JSON.stringify(Object.keys(b.mcpServers)));
console.log("servers after :", JSON.stringify(Object.keys(a.mcpServers)));

const t1 = b.mcpServers.TestSprite;
const t2 = a.mcpServers.TestSprite;
console.log("TestSprite structurally identical:", JSON.stringify(t1) === JSON.stringify(t2));
console.log("TestSprite API_KEY length before/after:", (t1.env.API_KEY || "").length, (t2.env.API_KEY || "").length);
console.log("nemons entry:", JSON.stringify(a.mcpServers.nemons));

const q = require("../nemos/src/utils/qoder-host");
console.log("verifyRegistration:", JSON.stringify(q.verifyRegistration({ home: q.qoderHome(), expectedUrl: "http://127.0.0.1:3456/mcp" }), null, 1).slice(0, 700));
console.log("skill:", JSON.stringify(q.skillInstalled({ home: q.qoderHome() })));
console.log("runtime discovery (nemons):", JSON.stringify(q.readRuntimeDiscovery({ name: "nemons" })));
console.log("runtime discovery (TestSprite):", JSON.stringify(q.readRuntimeDiscovery({ name: "TestSprite" })).slice(0, 300));
