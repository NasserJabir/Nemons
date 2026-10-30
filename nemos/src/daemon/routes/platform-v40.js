// ============================================================
// v4.0/v4.1 endpoints (Pipeline, Identity, Candidate Lifecycle, State, Contracts, Golden Tasks, Metrics, Webhooks, OpenAPI, Enforcer, Persona Evolver, Orchestrator, Skill Evolver)
// Extracted verbatim from server.js — registered via the shared
// context (composition root services + engine state). Do not
// instantiate services here; they live in services.js.
// ============================================================
const { promoteApproved } = require("../approval-promotion");
const { refusalFor } = require("../../utils/asset-kinds");

module.exports = function register(app, ctx) {
  const { services, pipeline, rateLimiter, enforcer } = ctx;

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
  try { const im = services.identity; res.json(await im.registerIdentity(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/identity/list", async (req, res) => {
  try { const im = services.identity; res.json(await im.listIdentities()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/identity/stats", async (req, res) => {
  try { const im = services.identity; res.json(await im.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Candidate Lifecycle (Invariant #7) ----------
app.post("/candidate/register", async (req, res) => {
  try { const cl = services.candidateLifecycle; res.json(await cl.registerCandidate(req.body)); }
  catch (e) {
    // A kind with no adoption destination is a caller mistake, not a server
    // fault: answer 400 with the kinds that can actually be adopted.
    if (e.code === "unsupported_candidate_kind") {
      const refusal = refusalFor(e.kind);
      return res.status(400).json({
        error: e.code,
        kind: e.kind,
        reason: refusal?.reason || "unknown_candidate_kind",
        detail: refusal?.detail || null,
        supported_kinds: e.supported_kinds,
      });
    }
    res.status(500).json({ error: e.message });
  }
});
app.post("/candidate/:id/approve", async (req, res) => {
  try {
    const cl = services.candidateLifecycle;
    const result = await cl.approve(req.params.id, req.body.approver, req.body.comment);
    if (result.error) return res.status(404).json(result);
    // Invariant #4 (Use != Adopt): flipping the candidate's status is only
    // half the loop. An asset nobody can retrieve was never adopted, so
    // promotion into the store that serves it (status "adopted") is part of
    // approval — for every kind that has a destination, not just skills.
    result.adoption = await promoteApproved(services, result.candidate, {
      adoptedBy: req.body.approver || "anonymous",
    });
    if (result.adoption.promoted) result.adopted_into = result.adoption.adopted_into;
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/candidate/:id/can-use", async (req, res) => {
  try { const cl = services.candidateLifecycle; res.json(await cl.canUse(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/candidate/list", async (req, res) => {
  try { const cl = services.candidateLifecycle; res.json(await cl.listByStatus(req.query.status)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- State Manager ----------
app.post("/state/snapshot", async (req, res) => {
  try { const sm = services.stateManager; res.json(await sm.snapshot(req.body.instance_id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/state/stats", async (req, res) => {
  try { const sm = services.stateManager; res.json(await sm.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Contracts ----------
app.post("/tools/register", async (req, res) => {
  try { const tc = services.toolContract; res.json(await tc.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/tools/list", async (req, res) => {
  try { const tc = services.toolContract; res.json(await tc.listAll()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/tool-providers/register", async (req, res) => {
  try { const tp = services.toolProviderContract; res.json(await tp.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/adapters/register", async (req, res) => {
  try { const ac = services.adapterContract; res.json(await ac.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/environments/register", async (req, res) => {
  try { const ee = services.executionEnvironment; res.json(await ee.register(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Evaluation ----------
app.get("/golden-tasks/list", (req, res) => { res.json(services.goldenTasks.getAll()) });
app.post("/golden-tasks/:id/evaluate", (req, res) => {
  try { res.json(services.goldenTasks.evaluate(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/metrics/record", async (req, res) => {
  try { const mc = services.metrics; res.json(await mc.recordRun(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/metrics/aggregate", async (req, res) => {
  try { const mc = services.metrics; res.json(await mc.getAggregate()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Production Features ----------
app.get("/rate-limit/stats", (req, res) => { res.json(rateLimiter.stats()) });
app.post("/webhooks/subscribe", async (req, res) => {
  try { const wm = services.webhooks; res.json(await wm.subscribe(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/webhooks/stats", async (req, res) => {
  try { const wm = services.webhooks; res.json(await wm.stats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/openapi", (req, res) => { res.json(services.openapi.generate()) });
app.get("/api-docs", (req, res) => { res.type("text/html").send(services.openapi.generateHTML()) });

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
    const pe = services.personaEvolver;
    res.json(await pe.createDynamic(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/persona/evolver/:id/evolve", async (req, res) => {
  try {
    const pe = services.personaEvolver;
    res.json(await pe.evolve(req.params.id, req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/persona/evolver/detect-gaps", async (req, res) => {
  try {
    const pe = services.personaEvolver;
    res.json(await pe.detectGaps(req.body.taskHistory || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/persona/evolver/list", async (req, res) => {
  try {
    const pe = services.personaEvolver;
    res.json(await pe.listAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/persona/evolver/stats", async (req, res) => {
  try {
    const pe = services.personaEvolver;
    res.json(await pe.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Subagent Orchestrator ----------
app.post("/subagent/orchestrate", async (req, res) => {
  try {
    const { SubagentManager } = require("../utils/subagent-manager");
    const sm = services.subagents;
    const so = services.subagentOrchestrator;
    const { DAGPlanner } = require("../utils/dag-planner");
    const dag = services.dagPlanner;
    const plan = dag.plan(req.body.task || "");
    res.json(await so.autoOrchestrate(req.body.task || "", plan, req.body.identity_id || "system"));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/subagent/orchestrator/stats", async (req, res) => {
  try {
    const { SubagentManager } = require("../utils/subagent-manager");
    const so = services.subagentOrchestrator;
    res.json(await so.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Skill Evolver ----------
app.post("/skill-evolver/detect-gaps", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = services.skillEvolver;
    res.json(await se.detectGaps(req.body.experienceHistory || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/create-proactive", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = services.skillEvolver;
    res.json(await se.createProactive(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/:id/evolve", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = services.skillEvolver;
    res.json(await se.evolve(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/skill-evolver/:id/performance", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = services.skillEvolver;
    res.json(await se.recordPerformance(req.params.id, req.body.success));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/skill-evolver/stats", async (req, res) => {
  try {
    const { UnifiedSkillSystem } = require("../utils/unified-skills");
    const { CandidateLifecycle } = require("../utils/candidate-lifecycle");
    const se = services.skillEvolver;
    res.json(await se.stats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
};
