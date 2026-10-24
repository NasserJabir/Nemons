// ============================================================
// v2.5.0 endpoints (Trust Enforcement, Unified Skills System)
// Extracted verbatim from server.js — registered via the shared
// context (composition root services + engine state). Do not
// instantiate services here; they live in services.js.
// ============================================================
module.exports = function register(app, ctx) {
  const { trustFactor, services } = ctx;

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
    const us = services.unifiedSkills;
    res.json(await us.register(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/unified-skills/retrieve", async (req, res) => {
  try {
    const us = services.unifiedSkills;
    const full = req.query.full === "true";
    res.json(await us.retrieve(req.query.q || "", parseInt(req.query.limit || "5"), full));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/unified-skills/compile-from-run", async (req, res) => {
  try {
    const us = services.unifiedSkills;
    res.json(await us.compileFromRun(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/unified-skills/:id/record", async (req, res) => {
  try {
    const us = services.unifiedSkills;
    res.json(await us.recordExecution(req.params.id, req.body.success));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/unified-skills/stats", async (req, res) => {
  try {
    const us = services.unifiedSkills;
    res.json(await us.stats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/unified-skills/budget", async (req, res) => {
  try {
    const us = services.unifiedSkills;
    res.json(await us.tokenBudget());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// v2.5.1: /verify/info removed (Nemos does not use LLM API directly)
};
