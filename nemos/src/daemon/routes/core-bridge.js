// ============================================================
// v4.2.1 @nemons/core bridge endpoints (governed evolution, persistent stores, paired evaluation, interception, import/export)
// Extracted verbatim from server.js — registered via the shared
// context (composition root services + engine state). Do not
// instantiate services here; they live in services.js.
// ============================================================
const path = require("path");
const { createFileBackedCandidateStore } = require("../../utils/governed-candidate-store");
const { promoteApproved } = require("../approval-promotion");
const { refusalFor, kindTable, DESTINATIONS } = require("../../utils/asset-kinds");

module.exports = function register(app, ctx) {
  const { services, nemosBridge, requireCoreOr503, getCoreLoaded, getCoreLoadError, NEMONS_HOME, config } = ctx;

  // ============================================================
// v4.2.1: @nemons/core BRIDGE ENDPOINTS
// These expose TS-core functionality the JS daemon never had:
// governed evolution lifecycle, persistent stores, paired
// evaluation, action interception, regression detection,
// ablation testing, import/export. All return 503 if the
// core dist isn't built.
// ============================================================

// === Bridge status ===
//
// The advertised API list used to be a hand-written claim: three of the names
// below resolved to wrappers that dereferenced non-existent core symbols, and
// nothing noticed because the surface looked present. It is now checked on
// every response — `unavailable_apis` names anything advertised that the bridge
// cannot actually call, and `bridge_integrity` reports core symbols this
// process dereferences but the loaded namespace does not export. Both are
// empty on a healthy bridge; CI asserts they stay empty.
const DECLARED_APIS = [
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
];
const DECLARED_API_GROUPS = ["P2.*"];

app.get("/core/status", (req, res) => {
  const loaded = getCoreLoaded();
  const unavailable = loaded
    ? DECLARED_APIS.filter((name) => typeof nemosBridge[name] !== "function")
    : [];
  res.json({
    bridge_loaded: loaded,
    core_path: nemosBridge.corePath(),
    core_load_error: getCoreLoadError(),
    available_apis: loaded ? [...DECLARED_APIS, ...DECLARED_API_GROUPS] : [],
    unavailable_apis: unavailable,
    bridge_integrity: loaded ? nemosBridge.missingCoreSymbols() : { loaded: false, checked: 0, missing: [] },
    governed_store: governedStoreSummary(),
    // Which candidate kinds approval can actually adopt, and why the others
    // cannot. The list is derived from utils/asset-kinds.js, not restated.
    candidate_kinds: kindTable(),
  });
});

  // === Governed Evolution ===
  //
  // One engine per daemon process. These routes used to build a fresh
  // engine (and a fresh InMemoryCandidateStore) on every request, so
  // `propose` then `approve` could never work — the approval searched an
  // empty store. They also sent an object ({proposedAsset, proposedById,
  // sourceKind, justification}) to a core API that takes positional
  // ProposeCandidateInput fields, so every call failed even on the first
  // request. Both are fixed here: hoisted engine + the real contract.
  //
  // The store is file-backed: core's InMemoryCandidateStore is the
  // authority for validation/transitions, and core's persistent store is
  // async, which the synchronous engine cannot consume. Without this the
  // whole propose → review → approve → rollback chain evaporates on every
  // daemon restart. Request bodies cannot override the store.
  let governedEngine = null;
  let governedStore = null;

  function ensureGovernedStore() {
    if (governedStore || !getCoreLoaded()) return governedStore;
    try {
      const baseStore = nemosBridge.createCandidateStore();
      governedStore = createFileBackedCandidateStore(baseStore.constructor, path.join(NEMONS_HOME, "governed-candidates"));
    } catch (err) {
      // Never fake durability: if the file store cannot be built the engine
      // still runs, and /core/status reports why it is volatile.
      governedStore = { describe: () => ({ kind: "in-memory", error: err.message }) };
    }
    return governedStore;
  }

  function getGovernedEngine() {
    if (governedEngine) return governedEngine;
    const options = {};
    const store = ensureGovernedStore();
    if (store) options.candidateStore = store;
    governedEngine = nemosBridge.createGovernedEvolutionEngine(options);
    return governedEngine;
  }

  function governedStoreSummary() {
    const store = ensureGovernedStore();
    return store && typeof store.describe === "function" ? store.describe() : null;
  }

  // Accept the documented snake_case body, the core's camelCase names, or
  // a nested `asset` object — callers should not have to know which layer
  // invented which spelling.
  function proposeInput(body = {}) {
    const asset = body.asset || {};
    const input = {
      assetKind: body.asset_kind || body.assetKind || asset.kind || asset.assetKind,
      assetId: body.asset_id || body.assetId || asset.assetId || asset.id,
      proposedVersion: body.proposed_version || body.proposedVersion || body.version || asset.version,
      changeKind: body.change_kind || body.changeKind || "create",
      content: body.content || asset.content || {},
      proposedBy: body.proposed_by || body.proposedBy || body.proposedById || "anonymous",
      rationale: body.rationale || body.justification || "",
    };
    const evidenceRefs = body.evidence_refs || body.evidenceRefs;
    if (evidenceRefs) input.evidenceRefs = evidenceRefs;
    const supersedesId = body.supersedes_candidate_id || body.supersedesCandidateId;
    if (supersedesId) input.supersedesCandidateId = supersedesId;
    const supersedesVersion = body.supersedes_version || body.supersedesVersion;
    if (supersedesVersion) input.supersedesVersion = supersedesVersion;
    return input;
  }

  function missingProposeFields(input) {
    return ["assetKind", "assetId", "proposedVersion", "proposedBy"].filter((k) => !input[k]);
  }

  // The core throws plain Errors; map the message onto a status instead of
  // reporting every failure as a 500.
  function errorStatus(message) {
    const m = String(message || "");
    if (/not found/i.test(m)) return 404;
    if (/cannot|illegal|must|requires|already|conflict|invalid|supersede/i.test(m)) return 400;
    return 500;
  }

  function fail(res, e) {
    res.status(errorStatus(e.message)).json({ error: e.message });
  }

  // === Governed Evolution: propose a candidate ===
  app.post("/core/governed/propose", (req, res) => {
    if (!requireCoreOr503(req, res)) return;
    const input = proposeInput(req.body || {});
    const missing = missingProposeFields(input);
    if (missing.length) {
      return res.status(400).json({
        error: "missing_fields",
        fields: missing,
        expected: {
          asset_kind: "persona | skill | knowledge | memory | experience",
          asset_id: "stable asset id",
          proposed_version: "1.0.0",
          change_kind: "create | update | deprecate | rollback (default: create)",
          content: "{}",
          proposed_by: "reviewer identity",
        },
      });
    }
    try {
      const candidate = getGovernedEngine().propose(input);
      // Say up front whether approval can put this asset anywhere. The core
      // contract accepts `memory` and `experience`, but the daemon has no
      // store that serves either, so a review cycle would end in a status
      // change and nothing else.
      const refusal = refusalFor(candidate.assetKind);
      res.json({
        candidate,
        adoption: refusal
          ? { available: false, ...refusal }
          : { available: true, kind: candidate.assetKind, store: DESTINATIONS[candidate.assetKind].store },
      });
    } catch (e) { fail(res, e); }
  });

  // === Governed Evolution: inspect a candidate ===
  app.get("/core/governed/candidate/:id", (req, res) => {
    if (!requireCoreOr503(req, res)) return;
    try {
      const candidate = getGovernedEngine().getCandidate(req.params.id);
      if (!candidate) return res.status(404).json({ error: `candidate not found: ${req.params.id}` });
      res.json({ candidate });
    } catch (e) { fail(res, e); }
  });

  // === Governed Evolution: request review ===
  app.post("/core/governed/request-review", (req, res) => {
    if (!requireCoreOr503(req, res)) return;
    if (!req.body.candidate_id) return res.status(400).json({ error: "candidate_id is required" });
    try {
      const candidate = getGovernedEngine().requestReview(
        req.body.candidate_id,
        req.body.requested_by || "anonymous",
        req.body.comment || "",
      );
      res.json({ review_request: candidate });
    } catch (e) { fail(res, e); }
  });

  // === Governed Evolution: approve ===
  // tryApprove(candidateId, reviewer, comment) → { kind: "approved"|"denied" }.
  // A denied decision is a legitimate outcome, not an HTTP error.
  // The core transition only moves the record's status; it does not put the
  // asset anywhere. Promotion into the store that serves the asset is what
  // makes it usable (Invariant #4), so approval does both.
  app.post("/core/governed/approve", async (req, res) => {
    if (!requireCoreOr503(req, res)) return;
    if (!req.body.candidate_id) return res.status(400).json({ error: "candidate_id is required" });
    const reviewer = req.body.reviewed_by || req.body.reviewer || "anonymous";
    try {
      const candidateId = req.body.candidate_id;
      const approval = getGovernedEngine().tryApprove(
        candidateId,
        reviewer,
        req.body.comment || req.body.rationale || "",
      );
      const body = { approval, approved: approval.kind === "approved" };
      if (body.approved) {
        body.adoption = await promoteApproved(services, getGovernedEngine().getCandidate(candidateId), {
          adoptedBy: reviewer,
        });
        if (body.adoption.promoted) body.adopted_into = body.adoption.adopted_into;
      }
      res.json(body);
    } catch (e) { fail(res, e); }
  });

  // === Governed Evolution: supersede (version chain) ===
  // Two accepted forms: an existing `new_candidate_id` is linked to the old
  // candidate; otherwise a new candidate is proposed against it.
  app.post("/core/governed/supersede", (req, res) => {
    if (!requireCoreOr503(req, res)) return;
    const supersededId = req.body.superseded_id || req.body.superseded_candidate_id;
    if (!supersededId) return res.status(400).json({ error: "superseded_id is required" });
    const actor = req.body.actor || req.body.proposed_by || "anonymous";
    const reason = req.body.reason || req.body.justification || "";
    try {
      const engine = getGovernedEngine();
      if (req.body.new_candidate_id) {
        const supersession = engine.supersede(supersededId, req.body.new_candidate_id, actor, reason);
        return res.json({ supersession });
      }
      const input = proposeInput({
        ...req.body,
        change_kind: req.body.change_kind || "update",
        supersedes_candidate_id: supersededId,
      });
      const missing = missingProposeFields(input);
      if (missing.length) {
        return res.status(400).json({ error: "missing_fields", fields: missing });
      }
      const candidate = engine.propose(input);
      res.json({ supersession: { superseded_id: supersededId, candidate } });
    } catch (e) { fail(res, e); }
  });

  // === Governed Evolution: rollback ===
  app.post("/core/governed/rollback", (req, res) => {
    if (!requireCoreOr503(req, res)) return;
    if (!req.body.candidate_id) return res.status(400).json({ error: "candidate_id is required" });
    try {
      const rollback = getGovernedEngine(req.body.engine_options).rollback(
        req.body.candidate_id,
        req.body.rolled_back_by || req.body.actor || "anonymous",
        req.body.rationale || req.body.reason || "",
      );
      res.json({ rollback });
    } catch (e) { fail(res, e); }
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
