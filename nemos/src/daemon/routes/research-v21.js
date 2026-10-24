// ============================================================
// v2.1/v2.2.1 research endpoints (Trust, CBR, Verify, Redaction, DAG, IIR, Skills, Memory, Provenance, Approvals, Static Analysis, Secrets, Plugins, TTSI, Benchmark, Investigation, Persona, OO-Harness)
// Extracted verbatim from server.js — registered via the shared
// context (composition root services + engine state). Do not
// instantiate services here; they live in services.js.
// ============================================================
module.exports = function register(app, ctx) {
  const { services, trustFactor, verifier, redactionV2, counterexample, pluginRegistry, harnessRouter } = ctx;

  // ============================================================
// v2.2.1 ALL Research-Backed Endpoints
// ============================================================

// ---------- Trust Factor (GaaS) ----------
app.get("/trust/stats", async (req,res) => { try { res.json(await trustFactor.getTrustStats()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/trust/:id", async (req,res) => { try { res.json(await trustFactor.getTrustFactor(req.params.id)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/trust/:id/violation", async (req,res) => { try { const a=await trustFactor.recordViolation(req.params.id,req.body); res.json({agent:a,decision:trustFactor.getEnforcementDecision(a,req.body)}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- CBR ----------
app.get("/cbr/retrieve", async (req,res) => { try { const s=services.cbr; const r=await s.retrieve(req.query.q||"",parseInt(req.query.limit||"3")); res.json({results:r}) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/cbr/stats", async (req,res) => { try { const s=services.cbr; res.json(await s.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- 4-Layer Verification ----------
app.post("/verify", async (req,res) => { try { res.json(await verifier.verify(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Redaction ----------
app.post("/redact", (req,res) => { try { res.json(redactionV2.pipeline(req.body.text||"")) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/redact/assess", (req,res) => { try { res.json(redactionV2.assessRisk(req.body.text||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Counterexample Repair ----------
app.post("/repair/analyze", (req,res) => { try { const c=counterexample.extractCounterexample(req.body.evidence||{},req.body.verification_result||{}); res.json({counterexample:c,patch:counterexample.mapToPatch(c)}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- DAG Planning ----------
app.post("/dag/plan", (req,res) => { try { const p=services.dagPlanner; res.json(p.plan(req.body.query||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- I-IR ----------
app.post("/iir/validate", (req,res) => { try { const p=services.iirPlan; res.json({is_acyclic:p.isAcyclic(),validation:p.validate()}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Skill Library ----------
app.get("/skills/list", async (req,res) => { try { const l=services.skills; res.json(await l.list()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skills/retrieve", async (req,res) => { try { const l=services.skills; res.json(await l.retrieve(req.query.q||"")) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skills/stats", async (req,res) => { try { const l=services.skills; res.json(await l.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Memory ----------
app.get("/memory/stats", async (req,res) => { try { const m=services.memory; res.json(await m.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Provenance ----------
app.get("/provenance/stats", async (req,res) => { try { const t=services.provenance; res.json(await t.stats()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/provenance/verify", async (req,res) => { try { const t=services.provenance; res.json(await t.verify()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Approvals ----------
app.get("/approvals/stats", async (req,res) => { try { const w=services.approvals; res.json(await w.stats()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/approvals/pending", async (req,res) => { try { const w=services.approvals; res.json(await w.listPending()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Static Analysis ----------
app.post("/analyze/static", (req,res) => { try { const s=services.staticAnalysis; res.json(s.analyze(req.body.project_root||".")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Secret Detection ----------
app.post("/secrets/detect", (req,res) => { try { const d=services.secretDetector; res.json(d.detect(req.body.text||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Plugins ----------
app.get("/plugins/list", (req,res) => { res.json({plugins:pluginRegistry.list()}) });
app.get("/plugins/stats", (req,res) => { res.json(pluginRegistry.stats()) });

// ---------- TT-SI ----------
app.post("/ttsi/run", async (req,res) => { try { const t=services.ttsi; res.json(await t.run(req.body.task,req.body.response)) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Benchmark ----------
app.get("/benchmark/test-prompts", (req,res) => { res.json(services.benchmark.getTestPrompts()) });
app.post("/benchmark/transform", (req,res) => { try { res.json(services.benchmark.transform(req.body.formal_spec||"")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Investigation ----------
app.post("/investigate", async (req,res) => { try { res.json(await services.investigator.investigate(req.body.task || req.body.query || "unspecified task")) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Persona ----------
app.get("/persona/roles", (req,res) => { res.json(services.personaBuilder.listRoles()) });
app.post("/persona/build", (req,res) => { try { res.json({prompt:services.personaBuilder.build(req.body.role||"senior_engineer")}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- OO-Harness (v2.2.1 — arXiv:2610.28380) ----------
app.post("/harness/route", (req,res) => { try { res.json(harnessRouter.route(req.body.prompt||"")) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/harness/list", (req,res) => { res.json({harnesses:harnessRouter.list(),reference:"arXiv:2610.28380"}) });
app.get("/harness/:name/criteria", (req,res) => { try { const h=harnessRouter.getHarness(req.params.name); res.json({harness:h.name,criteria:h.getVerificationCriteria()}) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/harness/stats", (req,res) => { res.json(harnessRouter.getStats()) });
};
