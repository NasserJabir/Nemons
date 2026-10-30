// ============================================================
// v2.4.0 endpoints (Multi-Persona, Recaster, Subagents, Delegation, Skill Compiler, WikiSkill, MetaShare, Recursive Improver, Skill Directory, Scaffolding)
// Extracted verbatim from server.js — registered via the shared
// context (composition root services + engine state). Do not
// instantiate services here; they live in services.js.
// ============================================================
module.exports = function register(app, ctx) {
  const { services } = ctx;

  // ============================================================
// v2.4.0 Endpoints — Persona, Subagents, Skills, Self-Learning
// ============================================================

// ---------- Multi-Persona (arXiv:2610.12878) ----------
app.post("/persona/multi/generate", (req,res) => { try { const mp=services.multiPersona; res.json({perspectives:mp.generatePerspectives(req.body.problem||""),magic_circle:mp.createMagicCircle()}) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Persona Recasting (arXiv:2610.15788) ----------
app.post("/persona/recast", (req,res) => { try { const pr=services.personaRecaster; res.json(pr.recast(req.body.persona||{},req.body.context||{})) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Subagent Manager (arXiv:2605.08460) ----------
app.post("/subagent/spawn", async (req,res) => { try { const sm=services.subagents; res.json(await sm.spawn(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/subagent/list", async (req,res) => { try { const sm=services.subagents; res.json(await sm.list()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/subagent/:id/check", async (req,res) => { try { const sm=services.subagents; const subs=await sm.list(); const sub=subs.find(s=>s.id===req.params.id); if(sub)res.json(sm.checkInvariants(sub)); else res.status(404).json({error:"not found"}) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/subagent/stats", async (req,res) => { try { const sm=services.subagents; res.json(await sm.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Delegation Security (arXiv:2608.15888) ----------
app.post("/delegation/create", (req,res) => { try { const ds=services.delegation; res.json(ds.createChain(req.body.agent_id||"agent",req.body.scope)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/delegation/authorize", (req,res) => { try { const ds=services.delegation; res.json(ds.authorize(req.body.agent_id||"agent",req.body.request||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/delegation/delegate", (req,res) => { try { const ds=services.delegation; res.json(ds.delegate(req.body.parent_id,req.body.child_id,req.body.scope||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/delegation/stats", async (req,res) => { try { res.json(await services.delegation.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Skill Compiler (arXiv:2606.09316) ----------
app.post("/skillbank/compile", async (req,res) => { try { const sc=services.skillCompiler; res.json(await sc.compile(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skillbank/retrieve", async (req,res) => { try { const sc=services.skillCompiler; res.json(await sc.retrieve(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skillbank/stats", async (req,res) => { try { const sc=services.skillCompiler; res.json(await sc.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- WikiSkill (arXiv:2608.27454) ----------
app.post("/wikiskill/compile", async (req,res) => { try { const ws=services.wikiSkill; res.json(await ws.compileFromRun(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/wikiskill/retrieve", async (req,res) => { try { const ws=services.wikiSkill; res.json(await ws.retrieve(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/wikiskill/stats", async (req,res) => { try { const ws=services.wikiSkill; res.json(await ws.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- MetaShare (arXiv:2610.21887 NeurIPS 2026) ----------
app.post("/metashare/share", async (req,res) => { try { const ms=services.metaShare; res.json(await ms.shareFailure(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/metashare/retrieve", async (req,res) => { try { const ms=services.metaShare; res.json(await ms.retrieveSimilar(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/metashare/:id/solution", async (req,res) => { try { const ms=services.metaShare; res.json(await ms.proposeSolution(req.params.id,req.body.solution,req.body.agent_id)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/metashare/stats", async (req,res) => { try { const ms=services.metaShare; res.json(await ms.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Recursive Improver (arXiv:2609.26457) ----------
app.post("/recursive/improve", async (req,res) => { try { const ri=services.recursiveImprover; res.json(await ri.improveCycle(req.body.state||{},req.body.depth||0)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/recursive/stats", async (req,res) => { try { const ri=services.recursiveImprover; res.json(await ri.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Skill Directory (arXiv:2609.00065) ----------
app.post("/skilldir/create", async (req,res) => { try { const sd=services.skillDirectory; res.json(await sd.createSkill(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skilldir/:id", async (req,res) => { try { const sd=services.skillDirectory; res.json(await sd.loadSkill(req.params.id,req.query.full==="true")) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skilldir/list", async (req,res) => { try { const sd=services.skillDirectory; res.json(await sd.listAll()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/skilldir/budget", async (req,res) => { try { const sd=services.skillDirectory; res.json(await sd.tokenBudget()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Scaffolding Optimizer (arXiv:2607.13104) ----------
app.post("/scaffolding/optimize", async (req,res) => { try { const so=services.scaffolding; res.json(await so.optimize(req.body.scaffolding||{},req.body.performance||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/scaffolding/stats", async (req,res) => { try { res.json(await services.scaffolding.stats()) } catch(e) { res.status(500).json({error:e.message}) } });
};
