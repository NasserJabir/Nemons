// ============================================================
// Nemons Daemon — Express server
// Implements: /health, /analyze, /context-pack, /evidence,
//             /evaluate, /experiences, /metrics, /governance
// ============================================================
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const yaml = require("js-yaml");
// Simple local UUID v4 generator (no external dependency)
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- Load config (single source of truth: runtime-config.js) ----------
const { nemonsHome, loadDaemonConfig, resolvePort, resolveHost, migrateLegacyHome } = require("../utils/runtime-config");
const NEMONS_HOME = nemonsHome();
const CONFIG_PATH = process.env.NEMONS_CONFIG || path.join(NEMONS_HOME, "config", "daemon.yml");

// Fold any legacy ~/.nemos data into the canonical home (no-op when
// NEMONS_HOME is explicit or no legacy root exists).
migrateLegacyHome();

const config = loadDaemonConfig(CONFIG_PATH);

// ---------- Initialize data directories ----------
const DIRS = ["context-packs", "experiences", "evidence", "logs", "audit"];
(async () => {
  for (const dir of DIRS) {
    await fs.mkdir(path.join(NEMONS_HOME, dir), { recursive: true });
  }
})();

// ---------- App ----------
const app = express();
app.use(express.json({ limit: "10mb" }));

// Malformed JSON on /mcp must be a spec-correct JSON-RPC parse error
// (-32700, HTTP 400) instead of falling through to the generic 500.
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed" && req.path === "/mcp") {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } });
  }
  next(err);
});

// Composition root: all stateful services, instantiated once (see services.js)
const { services } = require("./services");
// Shared product-loop implementation (HTTP routes + MCP tools)
const coreLoop = require("./core-loop");

// ---------- Middleware: bearer token auth ----------
const crypto = require("crypto");
const { isSafeId, resolveWithin } = require("../utils/path-guard");

// Length-independent comparison so token probing reveals nothing
// about the expected token (a plain !== leaks length/prefix matches
// through response timing).
function safeTokenEqual(got, expected) {
  const a = Buffer.from(String(got || ""));
  const b = Buffer.from(String(expected || ""));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b); // burn comparable time for the mismatch path
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

app.use((req, res, next) => {
  // Skip auth for health check (allows local install verification)
  if (req.path === "/health" || req.path === "/metrics") {
    return next();
  }
  const expected = process.env.NEMONS_AUTH_TOKEN;
  if (expected) {
    const got = req.headers.authorization?.replace(/^Bearer\s+/i, "")
      || req.headers["x-nemons-token"];
    if (!got || !safeTokenEqual(got, expected)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
});

// ---------- Middleware: per-endpoint rate limiting ----------
// One shared instance — a per-request instance would reset its own
// counters and never limit anything. /health, /metrics and the
// dashboard pages stay exempt so monitoring and browsers keep working.
const rateLimiter = services.rateLimiter;
const RATE_LIMIT_EXEMPT = new Set(["/health", "/metrics", "/", "/dashboard", "/ui"]);
app.use((req, res, next) => {
  if (RATE_LIMIT_EXEMPT.has(req.path)) return next();
  const clientId = req.socket.remoteAddress || "unknown";
  const verdict = rateLimiter.check(req.path, clientId);
  if (!verdict.allowed) {
    res.set("Retry-After", "60");
    return res.status(429).json({
      error: "rate_limited",
      limit: verdict.limit,
      window_seconds: 60,
    });
  }
  next();
});

// ---------- Dashboard (static file; client renders via textContent — stored-XSS fix) ----------
const DASHBOARD_PATH = path.join(__dirname, "public", "dashboard.html");

app.get("/", (req, res) => {
  res.sendFile(DASHBOARD_PATH);
});

app.get("/dashboard", (req, res) => {
  res.sendFile(DASHBOARD_PATH);
});

app.get("/ui", (req, res) => {
  res.sendFile(DASHBOARD_PATH);
});

// ---------- Health endpoint ----------

// ---------- v2.1.0+v2.2.0+v2.2.1 Research-Backed Modules ----------
const trustFactor = require("../utils/trust-factor");
const verifier = require("../utils/verifier");
const redactionV2 = require("../utils/redaction-v2");
const counterexample = require("../utils/counterexample");
const { DAGPlanner } = require("../utils/dag-planner");
const { registry: pluginRegistry } = require("../utils/plugin-registry");

// ---------- v4.0.0 Pipeline Integration ----------
const { enforcer } = require("../utils/invariant-enforcer");
const { SubagentOrchestrator } = require("../utils/subagent-orchestrator");

const pipeline = services.pipeline;

const { router: harnessRouter } = require("../utils/harness-router");
// ---------- v2.3.0 Additional Research-Backed Modules ----------
const { ADMITBench } = require("../utils/admit-bench");
const { CodeVisionary } = require("../utils/code-visionary");
// ---------- v2.4.0 Focused Research: Persona, Subagents, Skills, Self-Learning ----------

// v4.2.1: Bridge to the @nemons/core TS package. Loaded async at
// startup; if the core dist is not built, the daemon still runs
// but with reduced capability (bridge endpoints return 503 and
// /health reports core_loaded=false).
const nemosBridge = require("../utils/nemos-bridge");
let coreLoaded = false;
let coreLoadError = null;
nemosBridge.loadCore()
  .then(() => { coreLoaded = true; console.log("[nemos] @nemons/core bridge loaded:", nemosBridge.corePath()); })
  .catch((e) => { coreLoadError = e.message; console.warn("[nemos] @nemons/core not loaded:", e.message); });

// Helper: refuse requests that need the core when it's not loaded.
function requireCoreOr503(req, res) {
  if (coreLoaded) return true;
  res.status(503).json({
    error: "nemos-core-not-loaded",
    message: coreLoadError || "@nemons/core bridge not initialized yet",
    hint: "Run `npm run build` in the @nemons/core package, then restart the daemon",
  });
  return false;
}
const { SubagentManager } = require("../utils/subagent-manager");
const { WikiSkill } = require("../utils/wiki-skill");
const { MetaShare } = require("../utils/metashare");
// ---------- v2.5.0 Production-Ready Modules ----------
const { UnifiedSkillSystem } = require("../utils/unified-skills");




app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    version: require("../../package.json").version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    config_loaded: !!config,
    home: NEMONS_HOME,
    // v4.2.1: surface @nemons/core bridge status
    core_loaded: coreLoaded,
    core_path: nemosBridge.corePath(),
    core_load_error: coreLoadError,
  });
});

// ---------- Runtime counters ----------
// Real counters, incremented at the actual event sites. These replace
// the previous hardcoded /metrics values (runs_total: 0,
// verification_pass_rate: 1.0) that reported fiction.
const counters = {
  intercepts: 0,          // prompts the analyzer decided to intercept
  evidence_stored: 0,     // evidence files written
  evaluations_total: 0,   // verification-loop runs
  evaluations_passed: 0,
};

app.get("/metrics", async (req, res) => {
  const experiencesDir = path.join(NEMONS_HOME, "experiences");
  let experienceCount = 0;
  try {
    const files = await fs.readdir(experiencesDir);
    experienceCount = files.length;
  } catch {}

  res.json({
    runs_total: counters.evaluations_total,
    experiences_total: experienceCount,
    // null (not a fake 1.0) until at least one evaluation has run
    verification_pass_rate: counters.evaluations_total > 0
      ? Math.round((counters.evaluations_passed / counters.evaluations_total) * 100) / 100
      : null,
    intercepts_total: counters.intercepts,
    evidence_stored_total: counters.evidence_stored,
    daemon_memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    daemon_uptime_seconds: process.uptime(),
  });
});

// POST /analyze — decide if Nemons should intercept the prompt
// v4.0.0: INTEGRATED /analyze — builds DYNAMIC Context Pack
// with persona + skills + subagents + experiences + harness
// Logic lives in core-loop.js so the MCP tools stay in lockstep.
app.post("/analyze", async (req, res) => {
  res.json(await coreLoop.analyzePrompt(req.body, { pipeline, counters }));
});

// GET /context-pack/:id — return a context pack (logic in core-loop.js)
app.get("/context-pack/:id", async (req, res) => {
  const { status, body } = await coreLoop.getContextPack(req.params.id, { NEMONS_HOME });
  res.status(status).json(body);
});

// POST /evidence — collect evidence for a run (logic in core-loop.js)
app.post("/evidence", async (req, res) => {
  const { status, body } = await coreLoop.collectEvidence(req.body, {
    NEMONS_HOME, counters, redactSecrets,
  });
  res.status(status).json(body);
});

// POST /evaluate — run verification
// v4.0.0: INTEGRATED /evaluate — auto-compiles to skills + notifies webhooks
// (logic in core-loop.js so the MCP tools stay in lockstep)
app.post("/evaluate", async (req, res) => {
  try {
    res.json(await coreLoop.evaluateRun(req.body, { services, counters, verifier, pipeline }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /experiences — store a new experience manually (logic in core-loop.js)
app.post("/experiences", async (req, res) => {
  res.json(await coreLoop.storeExperience(req.body, { NEMONS_HOME }));
});

// GET /experiences — list experiences
app.get("/experiences", async (req, res) => {
  const limit = parseInt(req.query.limit || "10");
  const dir = path.join(NEMONS_HOME, "experiences");
  try {
    const files = await fs.readdir(dir);
    const experiences = [];
    for (const file of files.slice(0, limit)) {
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf8");
        experiences.push(JSON.parse(raw));
      } catch {}
    }
    res.json({ total: files.length, experiences });
  } catch {
    res.json({ total: 0, experiences: [] });
  }
});

// GET /governance/rules
app.get("/governance/rules", async (req, res) => {
  const rulesPath = path.join(NEMONS_HOME, "config", "governance-rules.yml");
  try {
    const raw = await fs.readFile(rulesPath, "utf8");
    res.json(yaml.load(raw));
  } catch {
    res.json({ message: "No governance rules configured" });
  }
});

// POST /sessions/start
app.post("/sessions/start", (req, res) => {
  console.log("[nemons] Session started:", req.body);
  res.json({ ok: true });
});

// POST /sessions/end
app.post("/sessions/end", (req, res) => {
  console.log("[nemons] Session ended:", req.body);
  res.json({ ok: true });
});

// ---------- Helper functions ----------
async function findRelevantPack(prompt, projectRoot) {
  // Try to find a pack that matches keywords in prompt
  const packsDir = path.join(NEMONS_HOME, "context-packs");
  try {
    const files = await fs.readdir(packsDir);
    for (const file of files) {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        const packName = file.replace(/\.(yml|yaml)$/, "");
        if (prompt.toLowerCase().includes(packName.toLowerCase())) {
          return packName;
        }
      }
    }
  } catch {}
  return "default";
}

async function findSimilarExperiences(prompt, limit) {
  const dir = path.join(NEMONS_HOME, "experiences");
  const results = [];
  try {
    const files = await fs.readdir(dir);
    for (const file of files.slice(-10)) {
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf8");
        const exp = JSON.parse(raw);
        // Simple keyword overlap scoring
        const expPrompt = exp.prompt || "";
        const overlap = calculateOverlap(prompt, expPrompt);
        if (overlap > 0.1) {
          results.push({ id: exp.id, relevance: overlap, prompt: expPrompt.slice(0, 100) });
        }
      } catch {}
    }
  } catch {}
  return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
}

function calculateOverlap(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }
  return wordsA.size > 0 ? common / wordsA.size : 0;
}

function redactSecrets(obj) {
  const patterns = config?.security?.redaction?.patterns || [
    "API_KEY_\\w+",
    "Bearer \\w+",
    "sk-\\w+",
    "AKIA\\w+",
    "-----BEGIN.*PRIVATE KEY-----",
  ];
  const replace = config?.security?.redaction?.replace_with || "[REDACTED]";

  if (typeof obj === "string") {
    let redacted = obj;
    for (const p of patterns) {
      redacted = redacted.replace(new RegExp(p, "g"), replace);
    }
    return redacted;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }

  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = redactSecrets(v);
    }
    return result;
  }

  return obj;
}


// ============================================================
// Domain route modules — extracted from this file verbatim and
// registered in the original order. Shared state flows in via ctx.
// ============================================================
const routeCtx = {
  services,
  counters,
  trustFactor, verifier, redactionV2, counterexample,
  pluginRegistry, harnessRouter, enforcer, pipeline, rateLimiter,
  isSafeId,
  nemosBridge, requireCoreOr503,
  getCoreLoaded: () => coreLoaded,
  getCoreLoadError: () => coreLoadError,
  NEMONS_HOME, config,
  coreLoop, redactSecrets,
};
require("./routes/research-v21")(app, routeCtx);
require("./routes/research-v23")(app, routeCtx);
require("./routes/research-v24")(app, routeCtx);
require("./routes/production-v25")(app, routeCtx);
require("./routes/platform-v40")(app, routeCtx);
require("./routes/core-bridge")(app, routeCtx);
require("./routes/mcp")(app, routeCtx);

// ---------- Start server ----------
const port = resolvePort();
const host = resolveHost();

// ---------- Central 404 + error handling ----------
// Must be registered after every route: unmatched paths get a JSON 404
// (express' default is an HTML stack page), and anything a handler
// throws without its own try/catch lands in the error middleware
// instead of crashing the process or leaking a stack trace.
app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

// eslint-disable-next-line no-unused-vars — express identifies error
// middleware by arity (4 args), the next param must exist.
app.use((err, req, res, _next) => {
  console.error(`[nemons] ${req.method} ${req.path} failed:`, err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_error", detail: err.message });
});

if (require.main === module) {
  const server = app.listen(port, host, () => {
    console.log(`[nemons] Daemon listening on http://${host}:${port}`);
    console.log(`[nemons] Home: ${NEMONS_HOME}`);
    console.log(`[nemons] Config: ${CONFIG_PATH}`);
    console.log(`[nemons] Dashboard: http://${host}:${port}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("[nemons] Shutting down...");
    server.close(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    console.log("[nemons] Interrupted, shutting down...");
    server.close(() => process.exit(0));
  });
}

module.exports = { app, config, NEMONS_HOME };
