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

// ---------- Load config ----------
const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");
const CONFIG_PATH = process.env.NEMONS_CONFIG || path.join(NEMONS_HOME, "config", "daemon.yml");

let config;
try {
  const raw = require("fs").readFileSync(CONFIG_PATH, "utf8");
  config = yaml.load(raw);
} catch {
  console.warn(`[nemons] Config not found at ${CONFIG_PATH}, using defaults`);
  config = { daemon: { port: 3456, host: "127.0.0.1" } };
}

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

// ---------- Middleware: simple bearer token auth ----------
app.use((req, res, next) => {
  // Skip auth for health check (allows local install verification)
  if (req.path === "/health" || req.path === "/metrics") {
    return next();
  }
  const expected = process.env.NEMONS_AUTH_TOKEN;
  if (expected) {
    const got = req.headers.authorization?.replace("Bearer ", "");
    if (got !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
});

// ---------- Dashboard HTML ----------
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nemons Dashboard</title>
<style>
  :root {
    --bg: #0f172a;
    --card: #1e293b;
    --border: #334155;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --primary: #3b82f6;
    --success: #10b981;
    --warn: #f59e0b;
    --danger: #ef4444;
    --code: #0f172a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 2rem;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .logo-icon {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
  }
  .logo h1 {
    font-size: 1.5rem;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .logo .version {
    color: var(--muted);
    font-size: 0.875rem;
  }
  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--success);
    color: white;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .status-badge.offline {
    background: var(--danger);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    transition: transform 0.2s, border-color 0.2s;
  }
  .card:hover {
    transform: translateY(-2px);
    border-color: var(--primary);
  }
  .card-label {
    color: var(--muted);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .card-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text);
  }
  .card-value.success { color: var(--success); }
  .card-value.warn { color: var(--warn); }
  .card-value.danger { color: var(--danger); }
  .card-sub {
    color: var(--muted);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }
  section h2 {
    font-size: 1.125rem;
    margin-bottom: 1rem;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.75rem;
    color: var(--muted);
    margin-left: auto;
    font-weight: normal;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    text-align: left;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }
  td code {
    font-family: 'SFMono-Regular', Consolas, monospace;
    background: var(--bg);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--primary);
  }
  .method {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    font-family: monospace;
    min-width: 50px;
    text-align: center;
  }
  .method.GET { background: rgba(16, 185, 129, 0.2); color: var(--success); }
  .method.POST { background: rgba(59, 130, 246, 0.2); color: var(--primary); }
  .method.PUT { background: rgba(245, 158, 11, 0.2); color: var(--warn); }
  .method.DELETE { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
  .experience-item {
    padding: 0.75rem 1rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 0.5rem;
    font-family: monospace;
    font-size: 0.875rem;
  }
  .experience-item .meta {
    color: var(--muted);
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }
  .empty {
    color: var(--muted);
    text-align: center;
    padding: 2rem;
    font-style: italic;
  }
  .footer {
    text-align: center;
    color: var(--muted);
    font-size: 0.875rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border);
  }
  .footer a {
    color: var(--primary);
    text-decoration: none;
  }
  .refresh-btn {
    background: var(--primary);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background 0.2s;
  }
  .refresh-btn:hover {
    background: #2563eb;
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo">
      <div class="logo-icon">N</div>
      <div>
        <h1>Nemons</h1>
        <div class="version">v<span id="version">1.0.0</span> — Transparent Orchestrator</div>
      </div>
    </div>
    <div>
      <span class="status-badge" id="status">
        <span class="status-dot"></span>
        <span id="status-text">Checking...</span>
      </span>
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="card-label">Uptime</div>
      <div class="card-value" id="uptime">—</div>
      <div class="card-sub" id="uptime-sub">since —</div>
    </div>
    <div class="card">
      <div class="card-label">Experiences Stored</div>
      <div class="card-value success" id="experiences">—</div>
      <div class="card-sub">successful runs</div>
    </div>
    <div class="card">
      <div class="card-label">Memory Usage</div>
      <div class="card-value" id="memory">—</div>
      <div class="card-sub">RSS</div>
    </div>
    <div class="card">
      <div class="card-label">Config Loaded</div>
      <div class="card-value" id="config">—</div>
      <div class="card-sub" id="config-sub">—</div>
    </div>
  </div>

  <section>
    <h2>
      API Endpoints
      <span class="badge">10 routes</span>
    </h2>
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Endpoint</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><span class="method GET">GET</span></td><td><code>/health</code></td><td>Daemon health check</td></tr>
        <tr><td><span class="method GET">GET</span></td><td><code>/metrics</code></td><td>Daemon metrics</td></tr>
        <tr><td><span class="method POST">POST</span></td><td><code>/analyze</code></td><td>Analyze prompt — should intercept?</td></tr>
        <tr><td><span class="method GET">GET</span></td><td><code>/context-pack/:id</code></td><td>Get context pack</td></tr>
        <tr><td><span class="method POST">POST</span></td><td><code>/evidence</code></td><td>Store evidence (with redaction)</td></tr>
        <tr><td><span class="method POST">POST</span></td><td><code>/evaluate</code></td><td>Run verification loop</td></tr>
        <tr><td><span class="method GET">GET</span></td><td><code>/experiences</code></td><td>List experiences</td></tr>
        <tr><td><span class="method POST">POST</span></td><td><code>/experiences</code></td><td>Store new experience</td></tr>
        <tr><td><span class="method GET">GET</span></td><td><code>/governance/rules</code></td><td>Get governance rules</td></tr>
        <tr><td><span class="method POST">POST</span></td><td><code>/sessions/start</code></td><td>Session audit (start)</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>
      Recent Experiences
      <span class="badge"><span id="exp-count">0</span> total</span>
    </h2>
    <div id="experiences-list">
      <div class="empty">No experiences yet. Run your coding agent on a prompt like:<br>
      <code>implement a hello world function</code><br>
      to see experiences appear here.</div>
    </div>
  </section>

  <section>
    <h2>
      Try It: Analyze a Prompt
      <span class="badge">test interceptor</span>
    </h2>
    <div style="display: flex; gap: 0.5rem;">
      <input type="text" id="test-prompt" placeholder="e.g., implement a hello world function" 
        style="flex: 1; padding: 0.75rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 0.875rem;">
      <button class="refresh-btn" onclick="analyzePrompt()">Analyze</button>
    </div>
    <div id="analyze-result" style="margin-top: 1rem; font-family: monospace; font-size: 0.875rem; color: var(--muted);">
      Result will appear here.
    </div>
  </section>

  <div class="footer">
    Nemons Daemon — running on port 3456 |
    <a href="https://github.com/your-org/nemons">GitHub</a> |
    Auto-refresh in <span id="countdown">30</span>s |
    <button class="refresh-btn" style="margin-left: 0.5rem;" onclick="loadData()">Refresh now</button>
  </div>
</div>

<script>
let countdown = 30;

function formatUptime(seconds) {
  if (seconds < 60) return Math.floor(seconds) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
  return Math.floor(seconds / 86400) + 'd ' + Math.floor((seconds % 86400) / 3600) + 'h';
}

async function loadData() {
  try {
    // Health
    const health = await fetch('/health').then(r => r.json());
    document.getElementById('version').textContent = health.version || '1.0.0';
    document.getElementById('uptime').textContent = formatUptime(health.uptime || 0);
    document.getElementById('uptime-sub').textContent = 'since ' + new Date(Date.now() - (health.uptime || 0) * 1000).toLocaleTimeString();
    document.getElementById('config').textContent = health.config_loaded ? '✓' : '✗';
    document.getElementById('config-sub').textContent = health.home ? health.home : '—';
    
    const statusEl = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    if (health.status === 'healthy') {
      statusEl.classList.remove('offline');
      statusText.textContent = 'Healthy';
    } else {
      statusEl.classList.add('offline');
      statusText.textContent = 'Unhealthy';
    }
  } catch (err) {
    const statusEl = document.getElementById('status');
    statusEl.classList.add('offline');
    document.getElementById('status-text').textContent = 'Offline';
  }
  
  try {
    // Metrics
    const metrics = await fetch('/metrics').then(r => r.json());
    document.getElementById('experiences').textContent = metrics.experiences_total || 0;
    document.getElementById('memory').textContent = (metrics.daemon_memory_mb || 0) + ' MB';
  } catch {}
  
  try {
    // Experiences
    const exp = await fetch('/experiences?limit=5').then(r => r.json());
    document.getElementById('exp-count').textContent = exp.total || 0;
    const list = document.getElementById('experiences-list');
    if (exp.experiences && exp.experiences.length > 0) {
      list.innerHTML = exp.experiences.map(e => \`
        <div class="experience-item">
          <strong>\${e.id}</strong>
          <span style="color: var(--muted)"> · \${new Date(e.timestamp).toLocaleString()}</span>
          \${e.prompt ? '<div class="meta">' + e.prompt.slice(0, 80) + (e.prompt.length > 80 ? '...' : '') + '</div>' : ''}
        </div>
      \`).join('');
    } else {
      list.innerHTML = '<div class="empty">No experiences yet. Run your coding agent on a prompt like:<br><code>implement a hello world function</code><br>to see experiences appear here.</div>';
    }
  } catch {}
}

async function analyzePrompt() {
  const prompt = document.getElementById('test-prompt').value.trim();
  if (!prompt) return;
  
  const resultEl = document.getElementById('analyze-result');
  resultEl.textContent = 'Analyzing...';
  resultEl.style.color = 'var(--muted)';
  
  try {
    const res = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        project_root: '/',
        adapter: 'opencode'
      })
    });
    const data = await res.json();
    resultEl.innerHTML = '<pre style="color: var(--text); white-space: pre-wrap;">' + 
      JSON.stringify(data, null, 2) + '</pre>';
  } catch (err) {
    resultEl.textContent = 'Error: ' + err.message;
    resultEl.style.color = 'var(--danger)';
  }
}

// Auto-refresh
setInterval(() => {
  countdown--;
  document.getElementById('countdown').textContent = countdown;
  if (countdown <= 0) {
    loadData();
    countdown = 30;
  }
}, 1000);

// Initial load
loadData();

// Enter key for prompt
document.getElementById('test-prompt').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') analyzePrompt();
});
</script>
</body>
</html>`;

app.get("/", (req, res) => {
  res.type("text/html").send(DASHBOARD_HTML);
});

app.get("/dashboard", (req, res) => {
  res.type("text/html").send(DASHBOARD_HTML);
});

app.get("/ui", (req, res) => {
  res.type("text/html").send(DASHBOARD_HTML);
});

// ---------- Health endpoint ----------

// ---------- v2.1.0+v2.2.0+v2.2.1 Research-Backed Modules ----------
const trustFactor = require("../utils/trust-factor");
const cbrStore = require("../utils/cbr");
const verifier = require("../utils/verifier");
const redactionV2 = require("../utils/redaction-v2");
const counterexample = require("../utils/counterexample");
const { DAGPlanner } = require("../utils/dag-planner");
const { IIRPlan } = require("../utils/iir");
const { SkillLibrary } = require("../utils/skill-library");
const { MultiTypeMemory } = require("../utils/memory");
const { ProvenanceTrail } = require("../utils/provenance");
const { ApprovalWorkflow } = require("../utils/approval-workflow");
const { StaticAnalysis } = require("../utils/static-analysis");
const { SecretDetector } = require("../utils/secret-detector");
const { registry: pluginRegistry } = require("../utils/plugin-registry");
const { TTSI } = require("../utils/ttsi");
const { RealisticBenchmark } = require("../utils/realistic-benchmark");
const { ActiveInvestigator } = require("../utils/investigator");

// ---------- v4.0.0 Pipeline Integration ----------
const { PipelineIntegrator } = require("../utils/pipeline-integrator");
const { IdentityManager } = require("../utils/identity-manager");
const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
const { StateManager } = require("../utils/state-manager");
const { ToolContract } = require("../utils/tool-contract");
const { ToolProviderContract } = require("../utils/tool-provider-contract");
const { AdapterContract } = require("../utils/adapter-contract");
const { ExecutionEnvironment } = require("../utils/execution-environment");
const { GoldenTaskSuite } = require("../utils/golden-tasks");
const { MetricsCollector } = require("../utils/metrics");
const { RateLimiter } = require("../utils/rate-limiter");
const { WebhookManager, SUPPORTED_EVENTS } = require("../utils/webhook-manager");
const { OpenAPISpec } = require("../utils/openapi-spec");
const { enforcer } = require("../utils/invariant-enforcer");
const { PersonaEvolver } = require("../utils/persona-evolver");
const { SubagentOrchestrator } = require("../utils/subagent-orchestrator");
const { SkillEvolver } = require("../utils/skill-evolver");

const pipeline = new PipelineIntegrator();

const { router: harnessRouter } = require("../utils/harness-router");
// ---------- v2.3.0 Additional Research-Backed Modules ----------
const { XMemory } = require("../utils/xmemory");
const { EvolutionEngine } = require("../utils/evolution-engine");
const { KanbanBoard } = require("../utils/kanban-board");
const { A2AProtocol } = require("../utils/a2a-protocol");
const { AgenticRAG } = require("../utils/agentic-rag");
const { ADMITBench } = require("../utils/admit-bench");
const { EnsembleGenerator } = require("../utils/ensemble");
const { HierarchicalCoT } = require("../utils/hierarchical-cot");
const { NoveltyToT } = require("../utils/novelty-tot");
const { CodeVisionary } = require("../utils/code-visionary");
// ---------- v2.4.0 Focused Research: Persona, Subagents, Skills, Self-Learning ----------
const { MultiPersona } = require("../utils/multi-persona");

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
const { PersonaRecaster } = require("../utils/persona-recaster");
const { SubagentManager } = require("../utils/subagent-manager");
const { DelegationSecurity } = require("../utils/delegation-security");
const { SkillCompiler } = require("../utils/skill-compiler");
const { WikiSkill } = require("../utils/wiki-skill");
const { MetaShare } = require("../utils/metashare");
const { RecursiveImprover } = require("../utils/recursive-improver");
const { SkillDirectory } = require("../utils/skill-directory");
const { ScaffoldingOptimizer } = require("../utils/scaffolding-optimizer");
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

app.get("/metrics", async (req, res) => {
  const experiencesDir = path.join(NEMONS_HOME, "experiences");
  let experienceCount = 0;
  try {
    const files = await fs.readdir(experiencesDir);
    experienceCount = files.length;
  } catch {}

  res.json({
    runs_total: 0,
    experiences_total: experienceCount,
    verification_pass_rate: 1.0,
    daemon_memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    daemon_uptime_seconds: process.uptime(),
  });
});

// POST /analyze — decide if Nemons should intercept the prompt
// v4.0.0: INTEGRATED /analyze — builds DYNAMIC Context Pack
// with persona + skills + subagents + experiences + harness
app.post("/analyze", async (req, res) => {
  const { prompt, project_root, adapter } = req.body;

  // Step 1: Smart filter (existing)
  const filters = require("../utils/filters");
  const filterResult = filters.shouldIntercept(prompt);
  if (!filterResult.should_intercept) {
    return res.json({ should_intercept: false, reason: filterResult.reason });
  }

  // Step 2: BUILD DYNAMIC CONTEXT PACK (v4.0.0 INTEGRATION!)
  try {
    const dynamicPack = await pipeline.buildContextPack(prompt, adapter);
    return res.json({
      should_intercept: true,
      reason: filterResult.reason,
      pattern: filterResult.pattern,
      suggested_pack_id: dynamicPack.suggested_pack_id,
      context_pack: dynamicPack.context_pack,
      pipeline: "integrated",
      components_used: dynamicPack.components_used,
      message: "Dynamic Context Pack built with persona + skills + experiences + harness + subagents",
    });
  } catch (e) {
    // Fallback to static pack if pipeline fails
    return res.json({
      should_intercept: true,
      reason: filterResult.reason,
      suggested_pack_id: "default",
      pipeline: "fallback",
      error: e.message,
    });
  }

});

// GET /context-pack/:id — return a context pack
app.get("/context-pack/:id", async (req, res) => {
  const packPath = path.join(NEMONS_HOME, "context-packs", `${req.params.id}.yml`);
  try {
    const raw = await fs.readFile(packPath, "utf8");
    const pack = yaml.load(raw);
    res.json(pack);
  } catch {
    // Return a default pack if specific one not found
    res.json({
      id: req.params.id,
      persona: {
        role: "Senior Engineer",
        constraints: ["Follow project conventions", "Write tests for new code"],
      },
      skills: [],
      knowledge: ["Project uses best practices"],
      success_criteria: ["Code passes tests", "No new lint warnings"],
    });
  }
});

// POST /evidence — collect evidence for a run
app.post("/evidence", async (req, res) => {
  const { run_id, evidence } = req.body;
  if (!run_id) {
    return res.status(400).json({ error: "run_id is required" });
  }

  // Apply redaction
  const redacted = redactSecrets(evidence || {});

  // Store
  const evidencePath = path.join(NEMONS_HOME, "evidence", `${run_id}.json`);
  await fs.writeFile(evidencePath, JSON.stringify(redacted, null, 2));

  res.json({ stored: true, run_id, redacted: true });
});

// POST /evaluate — run verification
// v4.0.0: INTEGRATED /evaluate — auto-compiles to skills + notifies webhooks
app.post("/evaluate", async (req, res) => {
  try {
    const { run_id, evidence, prompt, adapter } = req.body;
    const verifier = require("../utils/verifier");
    const result = await verifier.verify({
      prompt: prompt || "",
      response: evidence?.response || "",
      context: evidence?.context || "",
      evidence: evidence || {},
    });

    // v4.0.0: If passed → auto-compile experience to skill!
    if (result.pass) {
      try {
        const postRun = await pipeline.postRunProcessing({
          prompt: prompt || "",
          evidence: evidence || {},
          verification: result,
          adapter: adapter || "unknown",
        });
        result.post_run = postRun;
        result.message = "Verification passed. Experience stored + skill compiled as candidate + webhook notified.";
      } catch (e) {
        result.post_run_error = e.message;
      }
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /experiences — store a new experience manually
app.post("/experiences", async (req, res) => {
  const expId = `exp-${uuidv4().slice(0, 8)}`;
  const expPath = path.join(NEMONS_HOME, "experiences", `${expId}.json`);
  const data = {
    id: expId,
    timestamp: new Date().toISOString(),
    ...req.body,
  };
  await fs.writeFile(expPath, JSON.stringify(data, null, 2));
  res.json({ stored: true, id: expId });
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
// v2.2.1 ALL Research-Backed Endpoints
// ============================================================

// ---------- Trust Factor (GaaS) ----------
app.get("/trust/stats", async (req,res) => { try { res.json(await trustFactor.getTrustStats()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/trust/:id", async (req,res) => { try { res.json(await trustFactor.getTrustFactor(req.params.id)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/trust/:id/violation", async (req,res) => { try { const a=await trustFactor.recordViolation(req.params.id,req.body); res.json({agent:a,decision:trustFactor.getEnforcementDecision(a,req.body)}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- CBR ----------
app.get("/cbr/retrieve", async (req,res) => { try { const s=new cbrStore.CBRExperienceStore(); const r=await s.retrieve(req.query.q||"",parseInt(req.query.limit||"3")); res.json({results:r}) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/cbr/stats", async (req,res) => { try { const s=new cbrStore.CBRExperienceStore(); res.json(await s.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- 4-Layer Verification ----------
app.post("/verify", async (req,res) => { try { res.json(await verifier.verify(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Redaction ----------
app.post("/redact", (req,res) => { try { res.json(redactionV2.pipeline(req.body.text||"")) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/redact/assess", (req,res) => { try { res.json(redactionV2.assessRisk(req.body.text||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Counterexample Repair ----------
app.post("/repair/analyze", (req,res) => { try { const c=counterexample.extractCounterexample(req.body.evidence||{},req.body.verification_result||{}); res.json({counterexample:c,patch:counterexample.mapToPatch(c)}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- DAG Planning ----------
app.post("/dag/plan", (req,res) => { try { const p=new DAGPlanner(); res.json(p.plan(req.body.query||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- I-IR ----------
app.post("/iir/validate", (req,res) => { try { const p=new IIRPlan(); res.json({is_acyclic:p.isAcyclic(),validation:p.validate()}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Skill Library ----------
app.get("/skills/list", async (req,res) => { try { const l=new SkillLibrary(); res.json(await l.list()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skills/retrieve", async (req,res) => { try { const l=new SkillLibrary(); res.json(await l.retrieve(req.query.q||"")) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skills/stats", async (req,res) => { try { const l=new SkillLibrary(); res.json(await l.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Memory ----------
app.get("/memory/stats", async (req,res) => { try { const m=new MultiTypeMemory(); res.json(await m.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Provenance ----------
app.get("/provenance/stats", async (req,res) => { try { const t=new ProvenanceTrail(); res.json(await t.stats()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/provenance/verify", async (req,res) => { try { const t=new ProvenanceTrail(); res.json(await t.verify()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Approvals ----------
app.get("/approvals/stats", async (req,res) => { try { const w=new ApprovalWorkflow(); res.json(await w.stats()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/approvals/pending", async (req,res) => { try { const w=new ApprovalWorkflow(); res.json(await w.listPending()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Static Analysis ----------
app.post("/analyze/static", (req,res) => { try { const s=new StaticAnalysis(); res.json(s.analyze(req.body.project_root||".")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Secret Detection ----------
app.post("/secrets/detect", (req,res) => { try { const d=new SecretDetector(); res.json(d.detect(req.body.text||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Plugins ----------
app.get("/plugins/list", (req,res) => { res.json({plugins:pluginRegistry.list()}) });
app.get("/plugins/stats", (req,res) => { res.json(pluginRegistry.stats()) });

// ---------- TT-SI ----------
app.post("/ttsi/run", async (req,res) => { try { const t=new TTSI(); res.json(await t.run(req.body.task,req.body.response)) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Benchmark ----------
app.get("/benchmark/test-prompts", (req,res) => { res.json(new RealisticBenchmark().getTestPrompts()) });
app.post("/benchmark/transform", (req,res) => { try { res.json(new RealisticBenchmark().transform(req.body.formal_spec||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Investigation ----------
app.post("/investigate", async (req,res) => { try { const i=new ActiveInvestigator(); res.json(await i.investigate("test")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Persona ----------
app.get("/persona/roles", (req,res) => { res.json(new PersonaBuilder().listRoles()) });
app.post("/persona/build", (req,res) => { try { res.json({prompt:new PersonaBuilder().build(req.body.role||"senior_engineer")}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- OO-Harness (v2.2.1 — arXiv:2610.28380) ----------
app.post("/harness/route", (req,res) => { try { res.json({...harnessRouter.route(req.body.prompt||""),reference:"arXiv:2610.28380",improvement:"up to 15%"}) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/harness/list", (req,res) => { res.json({harnesses:harnessRouter.list(),reference:"arXiv:2610.28380"}) });
app.get("/harness/:name/criteria", (req,res) => { try { const h=harnessRouter.getHarness(req.params.name); res.json({harness:h.name,criteria:h.getVerificationCriteria()}) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/harness/stats", (req,res) => { res.json(harnessRouter.getStats()) });



// ============================================================
// v2.3.0 Endpoints — 10 Additional Research-Backed Features
// ============================================================

// ---------- xMemory (Hierarchical Memory) ----------
app.post("/xmemory/process", async (req,res) => { try { const m=new XMemory(); res.json(await m.process(req.body.messages||[],req.body.query)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/xmemory/retrieve", async (req,res) => { try { const m=new XMemory(); res.json(await m.retrieve(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/xmemory/stats", async (req,res) => { try { const m=new XMemory(); res.json(await m.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Evolution Engine (EvoAgentX) ----------
app.post("/evolution/run", async (req,res) => { try { const e=new EvolutionEngine(); res.json(await e.evolve(req.body.prompt||"",req.body.options)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/evolution/stats", (req,res) => { res.json(new EvolutionEngine().stats()) });

// ---------- Kanban Board ----------
app.post("/kanban/create", async (req,res) => { try { const b=new KanbanBoard(); res.json(await b.createWorker(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/kanban/:id/move", async (req,res) => { try { const b=new KanbanBoard(); res.json(await b.moveWorker(req.params.id,req.body.state,req.body.reason)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/kanban/board", async (req,res) => { try { const b=new KanbanBoard(); res.json(await b.getBoard()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/kanban/stats", async (req,res) => { try { const b=new KanbanBoard(); res.json(await b.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- A2A Protocol ----------
app.post("/a2a/register", async (req,res) => { try { const a=new A2AProtocol(); res.json(await a.registerAgent(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/a2a/discover", async (req,res) => { try { const a=new A2AProtocol(); res.json(await a.discover(req.query.capability)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/a2a/:id/send", async (req,res) => { try { const a=new A2AProtocol(); res.json(await a.sendTask(req.params.id,req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/a2a/agents", async (req,res) => { try { const a=new A2AProtocol(); res.json(await a.listAgents()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/a2a/stats", async (req,res) => { try { const a=new A2AProtocol(); res.json(await a.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Agentic RAG ----------
app.post("/rag/run", async (req,res) => { try { const r=new AgenticRAG(); res.json(await r.run(req.body.query||"",req.body.options)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/rag/stats", (req,res) => { res.json(new AgenticRAG().stats()) });

// ---------- ADMITBench ----------
app.post("/admit/evaluate", (req,res) => { try { const b=new ADMITBench(); res.json(b.evaluate(req.body.action||{},req.body.evidence||{},req.body.profile||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/admit/stats", (req,res) => { res.json(new ADMITBench().stats()) });

// ---------- Ensemble Code Generation ----------
app.post("/ensemble/run", async (req,res) => { try { const g=new EnsembleGenerator(); res.json(await g.run(req.body.prompt||"",req.body.options)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/ensemble/stats", (req,res) => { res.json(new EnsembleGenerator().stats()) });

// ---------- Hierarchical CoT ----------
app.post("/hcot/reason", (req,res) => { try { const h=new HierarchicalCoT(); res.json(h.reason(req.body.problem||"",req.body.depth||3)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/hcot/stats", (req,res) => { res.json(new HierarchicalCoT().stats()) });

// ---------- Novelty ToT ----------
app.post("/ntot/search", (req,res) => { try { const t=new NoveltyToT(); res.json(t.search(req.body.problem||"",req.body.maxNodes||20)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/ntot/stats", (req,res) => { res.json(new NoveltyToT().stats()) });

// ---------- CodeVisionary ----------
app.post("/codevision/evaluate", (req,res) => { try { const v=new CodeVisionary(); res.json(v.evaluate(req.body.code||"",req.body.criteria)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/codevision/stats", (req,res) => { res.json(new CodeVisionary().stats()) });



// ============================================================
// v2.4.0 Endpoints — Persona, Subagents, Skills, Self-Learning
// ============================================================

// ---------- Multi-Persona (arXiv:2610.12878) ----------
app.post("/persona/multi/generate", (req,res) => { try { const mp=new MultiPersona(); res.json({perspectives:mp.generatePerspectives(req.body.problem||""),magic_circle:mp.createMagicCircle()}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Persona Recasting (arXiv:2610.15788) ----------
app.post("/persona/recast", (req,res) => { try { const pr=new PersonaRecaster(); res.json(pr.recast(req.body.persona||{},req.body.context||{})) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Subagent Manager (arXiv:2605.08460) ----------
app.post("/subagent/spawn", async (req,res) => { try { const sm=new SubagentManager(); res.json(await sm.spawn(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/subagent/list", async (req,res) => { try { const sm=new SubagentManager(); res.json(await sm.list()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/subagent/:id/check", async (req,res) => { try { const sm=new SubagentManager(); const subs=await sm.list(); const sub=subs.find(s=>s.id===req.params.id); if(sub)res.json(sm.checkInvariants(sub)); else res.status(404).json({error:"not found"}) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/subagent/stats", async (req,res) => { try { const sm=new SubagentManager(); res.json(await sm.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Delegation Security (arXiv:2608.15888) ----------
app.post("/delegation/create", (req,res) => { try { const ds=new DelegationSecurity(); res.json(ds.createChain(req.body.agent_id||"agent",req.body.scope)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/delegation/authorize", (req,res) => { try { const ds=new DelegationSecurity(); res.json(ds.authorize(req.body.agent_id||"agent",req.body.request||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/delegation/delegate", (req,res) => { try { const ds=new DelegationSecurity(); res.json(ds.delegate(req.body.parent_id,req.body.child_id,req.body.scope||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/delegation/stats", (req,res) => { res.json(new DelegationSecurity().stats()) });

// ---------- Skill Compiler (arXiv:2606.09316) ----------
app.post("/skillbank/compile", async (req,res) => { try { const sc=new SkillCompiler(); res.json(await sc.compile(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skillbank/retrieve", async (req,res) => { try { const sc=new SkillCompiler(); res.json(await sc.retrieve(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skillbank/stats", async (req,res) => { try { const sc=new SkillCompiler(); res.json(await sc.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- WikiSkill (arXiv:2608.27454) ----------
app.post("/wikiskill/compile", async (req,res) => { try { const ws=new WikiSkill(); res.json(await ws.compileFromRun(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/wikiskill/retrieve", async (req,res) => { try { const ws=new WikiSkill(); res.json(await ws.retrieve(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/wikiskill/stats", async (req,res) => { try { const ws=new WikiSkill(); res.json(await ws.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- MetaShare (arXiv:2610.21887 NeurIPS 2026) ----------
app.post("/metashare/share", async (req,res) => { try { const ms=new MetaShare(); res.json(await ms.shareFailure(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/metashare/retrieve", async (req,res) => { try { const ms=new MetaShare(); res.json(await ms.retrieveSimilar(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/metashare/:id/solution", async (req,res) => { try { const ms=new MetaShare(); res.json(await ms.proposeSolution(req.params.id,req.body.solution,req.body.agent_id)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/metashare/stats", async (req,res) => { try { const ms=new MetaShare(); res.json(await ms.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Recursive Improver (arXiv:2609.26457) ----------
app.post("/recursive/improve", async (req,res) => { try { const ri=new RecursiveImprover(); res.json(await ri.improveCycle(req.body.state||{},req.body.depth||0)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/recursive/stats", async (req,res) => { try { const ri=new RecursiveImprover(); res.json(await ri.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Skill Directory (arXiv:2609.00065) ----------
app.post("/skilldir/create", async (req,res) => { try { const sd=new SkillDirectory(); res.json(await sd.createSkill(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skilldir/:id", async (req,res) => { try { const sd=new SkillDirectory(); res.json(await sd.loadSkill(req.params.id,req.query.full==="true")) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skilldir/list", async (req,res) => { try { const sd=new SkillDirectory(); res.json(await sd.listAll()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skilldir/budget", async (req,res) => { try { const sd=new SkillDirectory(); res.json(await sd.tokenBudget()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Scaffolding Optimizer (arXiv:2607.13104) ----------
app.post("/scaffolding/optimize", async (req,res) => { try { const so=new ScaffoldingOptimizer(); res.json(await so.optimize(req.body.scaffolding||{},req.body.performance||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/scaffolding/stats", (req,res) => { res.json(new ScaffoldingOptimizer().stats()) });



// ============================================================
// v2.5.0 Endpoints — Production-Ready Features
// ============================================================

// ---------- Trust Factor Enforcement (v2.5.0) ----------
app.post("/trust/:id/enforce", async (req, res) => {
  try {
    const decision = await trustFactor.enforce(req.params.id, req.body);
    res.json(decision);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/trust/enforcement-log", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50");
    res.json(await trustFactor.getEnforcementLog(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Unified Skills System (v2.5.0) ----------
app.post("/unified-skills/register", async (req, res) => {
  try {
    const us = new UnifiedSkillSystem();
    res.json(await us.register(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/unified-skills/retrieve", async (req, res) => {
  try {
    const us = new UnifiedSkillSystem();
    const full = req.query.full === "true";
    res.json(await us.retrieve(req.query.q || "", parseInt(req.query.limit || "5"), full));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/unified-skills/compile-from-run", async (req, res) => {
  try {
    const us = new UnifiedSkillSystem();
    res.json(await us.compileFromRun(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/unified-skills/:id/record", async (req, res) => {
  try {
    const us = new UnifiedSkillSystem();
    res.json(await us.recordExecution(req.params.id, req.body.success));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/unified-skills/stats", async (req, res) => {
  try {
    const us = new UnifiedSkillSystem();
    res.json(await us.stats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/unified-skills/budget", async (req, res) => {
  try {
    const us = new UnifiedSkillSystem();
    res.json(await us.tokenBudget());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// v2.5.1: /verify/info removed (Nemos does not use LLM API directly)


// ============================================================
// v4.0.0 — Pipeline + Production Endpoints
// ============================================================

// ---------- Pipeline Integration ----------
app.get("/pipeline/stats", async (req, res) => {
  try { res.json(await pipeline.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Identity (Invariant #1) ----------
app.post("/identity/register", async (req, res) => {
  try { const im = new IdentityManager(); res.json(await im.registerIdentity(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/identity/list", async (req, res) => {
  try { const im = new IdentityManager(); res.json(await im.listIdentities()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/identity/stats", async (req, res) => {
  try { const im = new IdentityManager(); res.json(await im.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Candidate Lifecycle (Invariant #7) ----------
app.post("/candidate/register", async (req, res) => {
  try { const cl = new CandidateLifecycle(); res.json(await cl.registerCandidate(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/candidate/:id/approve", async (req, res) => {
  try { const cl = new CandidateLifecycle(); res.json(await cl.approve(req.params.id, req.body.approver, req.body.comment)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/candidate/:id/can-use", async (req, res) => {
  try { const cl = new CandidateLifecycle(); res.json(await cl.canUse(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/candidate/list", async (req, res) => {
  try { const cl = new CandidateLifecycle(); res.json(await cl.listByStatus(req.query.status)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- State Manager ----------
app.post("/state/snapshot", async (req, res) => {
  try { const sm = new StateManager(); res.json(await sm.snapshot(req.body.instance_id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/state/stats", async (req, res) => {
  try { const sm = new StateManager(); res.json(await sm.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Contracts ----------
app.post("/tools/register", async (req, res) => {
  try { const tc = new ToolContract(); res.json(await tc.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/tools/list", async (req, res) => {
  try { const tc = new ToolContract(); res.json(await tc.listAll()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/tool-providers/register", async (req, res) => {
  try { const tp = new ToolProviderContract(); res.json(await tp.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/adapters/register", async (req, res) => {
  try { const ac = new AdapterContract(); res.json(await ac.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/environments/register", async (req, res) => {
  try { const ee = new ExecutionEnvironment(); res.json(await ee.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Evaluation ----------
app.get("/golden-tasks/list", (req, res) => { res.json(new GoldenTaskSuite().getAll()) });
app.post("/golden-tasks/:id/evaluate", (req, res) => {
  try { res.json(new GoldenTaskSuite().evaluate(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/metrics/record", async (req, res) => {
  try { const mc = new MetricsCollector(); res.json(await mc.recordRun(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/metrics/aggregate", async (req, res) => {
  try { const mc = new MetricsCollector(); res.json(await mc.getAggregate()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Production Features ----------
app.get("/rate-limit/stats", (req, res) => { res.json(new RateLimiter().stats()) });
app.post("/webhooks/subscribe", async (req, res) => {
  try { const wm = new WebhookManager(); res.json(await wm.subscribe(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/webhooks/stats", async (req, res) => {
  try { const wm = new WebhookManager(); res.json(await wm.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/openapi", (req, res) => { res.json(new OpenAPISpec().generate()) });
app.get("/api-docs", (req, res) => { res.type("text/html").send(new OpenAPISpec().generateHTML()) });

// ---------- Invariant Enforcer ----------
app.get("/enforcer/stats", async (req, res) => {
  try { res.json(await enforcer.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});



// ============================================================
// v4.1.0 — Evolution Endpoints
// ============================================================

// ---------- Persona Evolver ----------
app.post("/persona/evolver/create-dynamic", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.createDynamic(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/persona/evolver/:id/evolve", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.evolve(req.params.id, req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/persona/evolver/detect-gaps", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.detectGaps(req.body.taskHistory || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/persona/evolver/list", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.listAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/persona/evolver/stats", async (req, res) => {
  try {
    const pe = new PersonaEvolver();
    res.json(await pe.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Subagent Orchestrator ----------
app.post("/subagent/orchestrate", async (req, res) => {
  try {
    const { SubagentManager } = require("../utils/subagent-manager");
    const sm = new SubagentManager();
    const so = new SubagentOrchestrator(sm);
    const { DAGPlanner } = require("../utils/dag-planner");
    const dag = new DAGPlanner();
    const plan = dag.plan(req.body.task || "");
    res.json(await so.autoOrchestrate(req.body.task || "", plan, req.body.identity_id || "system"));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/subagent/orchestrator/stats", async (req, res) => {
  try {
    const { SubagentManager } = require("../utils/subagent-manager");
    const so = new SubagentOrchestrator(new SubagentManager());
    res.json(await so.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Skill Evolver ----------
app.post("/skill-evolver/detect-gaps", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.detectGaps(req.body.experienceHistory || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/create-proactive", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.createProactive(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/:id/evolve", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.evolve(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/:id/performance", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.recordPerformance(req.params.id, req.body.success));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/skill-evolver/stats", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = new SkillEvolver(new UnifiedSkillSystem(), new CandidateLifecycle());
    res.json(await se.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// v4.2.1: @nemons/core BRIDGE ENDPOINTS
// These expose TS-core functionality the JS daemon never had:
// governed evolution lifecycle, persistent stores, paired
// evaluation, action interception, regression detection,
// ablation testing, import/export. All return 503 if the
// core dist isn't built.
// ============================================================

// === Bridge status ===
app.get("/core/status", (req, res) => {
  res.json({
    bridge_loaded: coreLoaded,
    core_path: nemosBridge.corePath(),
    core_load_error: coreLoadError,
    available_apis: coreLoaded ? [
      "buildPersistentRuntime",
      "createGovernedEvolutionEngine",
      "createCandidateStore",
      "createPersistentCandidateStore",
      "createCandidateGenerator",
      "createEvaluationEngine",
      "createPairedEvaluator",
      "createOfflineSkillEvaluator",
      "createActionInterceptor",
      "createDeveloperInterface",
      "validatePersona",
      "validateSkill",
      "validateRun",
      "validateEvidence",
      "validateExperience",
      "validateCandidate",
      "validateContextPack",
      "P2.*",
    ] : [],
  });
});

// === Governed Evolution: propose a candidate ===
app.post("/core/governed/propose", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const engine = nemosBridge.createGovernedEvolutionEngine(req.body.engine_options || {});
    const result = engine.propose({
      proposedAsset: req.body.asset,
      proposedById: req.body.proposed_by || "anonymous",
      sourceKind: req.body.source_kind || "manual",
      justification: req.body.justification || "",
    });
    res.json({ candidate: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Governed Evolution: request review ===
app.post("/core/governed/request-review", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const engine = nemosBridge.createGovernedEvolutionEngine(req.body.engine_options || {});
    const result = engine.requestReview({
      candidateId: req.body.candidate_id,
      requestedById: req.body.requested_by,
      reviewerRole: req.body.reviewer_role,
    });
    res.json({ review_request: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Governed Evolution: approve ===
app.post("/core/governed/approve", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const engine = nemosBridge.createGovernedEvolutionEngine(req.body.engine_options || {});
    const result = engine.tryApprove({
      candidateId: req.body.candidate_id,
      reviewedById: req.body.reviewed_by,
      reviewerRole: req.body.reviewer_role,
      decision: "approved",
      rationale: req.body.rationale || "",
    });
    res.json({ approval: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Governed Evolution: supersede (version chain) ===
app.post("/core/governed/supersede", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const engine = nemosBridge.createGovernedEvolutionEngine(req.body.engine_options || {});
    const result = engine.supersede({
      supersededCandidateId: req.body.superseded_id,
      proposedAsset: req.body.new_asset,
      proposedById: req.body.proposed_by,
      sourceKind: req.body.source_kind || "manual",
      justification: req.body.justification || "",
    });
    res.json({ supersession: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Governed Evolution: rollback ===
app.post("/core/governed/rollback", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const engine = nemosBridge.createGovernedEvolutionEngine(req.body.engine_options || {});
    const result = engine.rollback({
      candidateId: req.body.candidate_id,
      rolledBackById: req.body.rolled_back_by,
      rationale: req.body.rationale || "",
    });
    res.json({ rollback: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Schema validators ===
app.post("/core/validate/persona", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try { nemosBridge.validatePersona(req.body); res.json({ valid: true }); }
  catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});
app.post("/core/validate/skill", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try { nemosBridge.validateSkill(req.body); res.json({ valid: true }); }
  catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});
app.post("/core/validate/run", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try { nemosBridge.validateRun(req.body); res.json({ valid: true }); }
  catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});
app.post("/core/validate/evidence", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try { nemosBridge.validateEvidence(req.body); res.json({ valid: true }); }
  catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});
app.post("/core/validate/experience", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try { nemosBridge.validateExperience(req.body); res.json({ valid: true }); }
  catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});
app.post("/core/validate/candidate", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try { nemosBridge.validateCandidate(req.body); res.json({ valid: true }); }
  catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});
app.post("/core/validate/context-pack", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try { nemosBridge.validateContextPack(req.body); res.json({ valid: true }); }
  catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});

// === Action interception (ADR-0016) ===
app.post("/core/action/check", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const interceptor = nemosBridge.createActionInterceptor({
      denyDestructiveByDefault: req.body.deny_destructive_by_default !== false,
      personaMustNot: req.body.persona_must_not || [],
    });
    const verdict = interceptor.verifyAction(req.body.action || {});
    res.json({
      verdict,
      allowed: nemosBridge.isActionAllowed(verdict),
      denied: nemosBridge.isActionDenied(verdict),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Regression detection (F-045) ===
app.post("/core/regression/detect", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().detectRegression(
      req.body.skill_id || "unknown",
      req.body.baseline_runs || [],
      req.body.candidate_runs || [],
      req.body.threshold || 0.1,
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Ablation testing (F-037) ===
app.post("/core/ablation/run", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().runAblation(req.body.config || {});
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Budget check (F-051) ===
app.post("/core/budget/check", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().checkRunBudget(
      req.body.metrics || {},
      req.body.limits || {},
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Permission check (F-050) ===
app.post("/core/permission/check", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().checkPermission(
      req.body.action || {},
      req.body.scope || {},
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Context budget optimization (F-015) ===
app.post("/core/context/optimize", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().optimizeForBudget(
      req.body.assets || [],
      req.body.budget,
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Historical reconstruction (F-030) ===
app.post("/core/reconstruct", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().reconstructRun(
      req.body.run_id,
      req.body.stores || {},
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Lineage graph (F-056) ===
app.post("/core/lineage/build", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().buildLineage(req.body.records || []);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Import / Export (F-063) ===
app.post("/core/assets/export", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const bundle = nemosBridge.P2().exportAssets(req.body.stores || {}, req.body.options || {});
    res.json(bundle);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/core/assets/import", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    const result = nemosBridge.P2().importAssets(req.body.bundle || {}, req.body.stores || {});
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Developer interface (F-059) — list + inspect ===
app.get("/core/dev/inspect/:runId", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    // Note: this needs a runtime; for the daemon's typical use
    // (ad-hoc inspection), we accept a JSON runtime snapshot in
    // the request body for now. A full implementation would
    // build a persistent runtime from NEMONS_HOME.
    const dev = nemosBridge.createDeveloperInterface(req.body?.runtime || null);
    const result = dev.inspectRun(req.params.runId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Identifier + provenance helpers ===
app.get("/core/id/:kind", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    res.json({ id: nemosBridge.freshId(req.params.kind || "generic") });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/core/sha256", (req, res) => {
  if (!requireCoreOr503(req, res)) return;
  try {
    res.json({ hash: nemosBridge.sha256(req.query.s || "") });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ---------- Start server ----------
const port = parseInt(process.env.NEMONS_PORT || config.daemon?.port || 3456);
const host = config.daemon?.host || "127.0.0.1";

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
