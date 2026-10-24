// ============================================================
// v2.3.0 endpoints (xMemory, Evolution, Kanban, A2A, RAG, ADMIT, Ensemble, HCoT, NToT, CodeVisionary)
// Extracted verbatim from server.js — registered via the shared
// context (composition root services + engine state). Do not
// instantiate services here; they live in services.js.
// ============================================================
module.exports = function register(app, ctx) {
  const { services, isSafeId } = ctx;

  // ============================================================
// v2.3.0 Endpoints — 10 Additional Research-Backed Features
// ============================================================

// ---------- xMemory (Hierarchical Memory) ----------
app.post("/xmemory/process", async (req,res) => { try { const m=services.xmemory; res.json(await m.process(req.body.messages||[],req.body.query)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/xmemory/retrieve", async (req,res) => { try { const m=services.xmemory; res.json(await m.retrieve(req.query.q||"",parseInt(req.query.limit||"5"))) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/xmemory/stats", async (req,res) => { try { const m=services.xmemory; res.json(await m.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Evolution Engine (EvoAgentX) ----------
app.post("/evolution/run", async (req,res) => { try { const e=services.evolution; res.json(await e.evolve(req.body.prompt||"",req.body.options)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/evolution/stats", (req,res) => { res.json(services.evolution.stats()) });

// ---------- Kanban Board ----------
app.post("/kanban/create", async (req,res) => { try { const b=services.kanban; res.json(await b.createWorker(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/kanban/:id/move", async (req,res) => { if (!isSafeId(req.params.id)) return res.status(400).json({error:"invalid_id"}); try { const b=services.kanban; res.json(await b.moveWorker(req.params.id,req.body.state,req.body.reason)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/kanban/board", async (req,res) => { try { const b=services.kanban; res.json(await b.getBoard()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/kanban/stats", async (req,res) => { try { const b=services.kanban; res.json(await b.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- A2A Protocol ----------
app.post("/a2a/register", async (req,res) => { try { const a=services.a2a; res.json(await a.registerAgent(req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/a2a/discover", async (req,res) => { try { const a=services.a2a; res.json(await a.discover(req.query.capability)) } catch(e) { res.status(500).json({error:e.message}) } });
app.post("/a2a/:id/send", async (req,res) => { if (!isSafeId(req.params.id)) return res.status(400).json({error:"invalid_id"}); try { const a=services.a2a; res.json(await a.sendTask(req.params.id,req.body)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/a2a/agents", async (req,res) => { try { const a=services.a2a; res.json(await a.listAgents()) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/a2a/stats", async (req,res) => { try { const a=services.a2a; res.json(await a.stats()) } catch(e) { res.status(500).json({error:e.message}) } });

// ---------- Agentic RAG ----------
app.post("/rag/run", async (req,res) => { try { const r=services.rag; res.json(await r.run(req.body.query||"",req.body.options)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/rag/stats", (req,res) => { res.json(services.rag.stats()) });

// ---------- ADMITBench ----------
app.post("/admit/evaluate", (req,res) => { try { const b=services.admit; res.json(b.evaluate(req.body.action||{},req.body.evidence||{},req.body.profile||{})) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/admit/stats", (req,res) => { res.json(services.admit.stats()) });

// ---------- Ensemble Code Generation ----------
app.post("/ensemble/run", async (req,res) => { try { const g=services.ensemble; res.json(await g.run(req.body.prompt||"",req.body.options)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/ensemble/stats", (req,res) => { res.json(services.ensemble.stats()) });

// ---------- Hierarchical CoT ----------
app.post("/hcot/reason", (req,res) => { try { const h=services.hcot; res.json(h.reason(req.body.problem||"",req.body.depth||3)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/hcot/stats", (req,res) => { res.json(services.hcot.stats()) });

// ---------- Novelty ToT ----------
app.post("/ntot/search", (req,res) => { try { const t=services.ntot; res.json(t.search(req.body.problem||"",req.body.maxNodes||20)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/ntot/stats", (req,res) => { res.json(services.ntot.stats()) });

// ---------- CodeVisionary ----------
app.post("/codevision/evaluate", (req,res) => { try { const v=services.codevision; res.json(v.evaluate(req.body.code||"",req.body.criteria)) } catch(e) { res.status(500).json({error:e.message}) } });
app.get("/codevision/stats", (req,res) => { res.json(services.codevision.stats()) });
};
