// ============================================================
// v4.2.1 @nemons/core bridge endpoints (governed evolution, persistent stores, paired evaluation, interception, import/export)
// Extracted verbatim from server.js — registered via the shared
// context (composition root services + engine state). Do not
// instantiate services here; they live in services.js.
// ============================================================
module.exports = function register(app, ctx) {
  const { nemosBridge, requireCoreOr503, getCoreLoaded, getCoreLoadError, NEMONS_HOME, config } = ctx;

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
    bridge_loaded: getCoreLoaded(),
    core_path: nemosBridge.corePath(),
    core_load_error: getCoreLoadError(),
    available_apis: getCoreLoaded() ? [
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
};
