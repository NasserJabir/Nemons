// ============================================================
// Defect regression suite.
//
// Every test here exists because a specific defect shipped:
//   - rate limiting keyed on the concrete path → vary the id and the
//     limit never trips (70/70 requests passed while the same id stopped
//     at 60), and the bucket map grew without bound
//   - CBR retrieval had no relevance floor → an unrelated past run was
//     injected into every context pack (a zero-overlap experience scored
//     0.3 and was always returned), and the field named `similarity`
//     reported that blended score, not similarity
//   - /core/governed/* passed object arguments to a positional core API
//     and built a fresh in-memory store per request → propose/approve
//     returned 500 for every call
//   - approving a candidate never put the skill anywhere retrievable, so
//     "adopted" assets could not be used
//   - the same was true for personas and knowledge, which had no adoption
//     destination at all — and the pack builder applied a freshly created
//     `status: "candidate"` persona on the very request that created it
//   - `/candidate/register` accepted any string as a type, so `rule`, `tool`,
//     `adapter`, `context_pack`, `experience`, and `memory` candidates could
//     reach status `adopted` with nothing consuming them
//   - `executeParallel` decided success with `Math.random() > 0.2`, so
//     `POST /subagent/orchestrate` and `/subagent/orchestrator/stats` reported
//     invented successes and failures for work nothing ever ran, and the pack
//     carried no record that execution had been delegated to the caller
//   - `mipro`/`aflow` filled unmeasured scores with `0.5 + Math.random() * 0.5`,
//     so `/evolution/run` returned a fabricated metric under a label
//   - `daemon start` printed success when the child had already died of
//     EADDRINUSE (a foreign listener satisfied the health poll)
//   - three bridge wrappers dereferenced core symbols that do not exist
//     (`PairedEvaluator`, `OfflineSkillEvaluator`, `validateCandidate`), so
//     `POST /core/validate/candidate` answered 400 for *every* body — a missing
//     function reported as invalid input, behind an advertised API list that
//     nothing verified
//   - candidate state lived only in RAM, so a daemon restart dropped every
//     pending/approved candidate and the review trail
//   - `verification.evaluation_criteria` in config/daemon.yml was dead
//     documentation: must_pass never reached the verifier
//
// Run: node tests/defect-regression-tests.js
// If any of these fail, the defect is back — block the release.
// ============================================================

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const TEST_HOME = path.join(os.tmpdir(), `nemons-regression-${Date.now()}`);
const BIN_PATH = path.join(__dirname, "..", "bin", "nemons.js");

// Small budget so the bypass test trips quickly; other endpoints in this
// suite stay well under it.
process.env.NEMONS_HOME = TEST_HOME;
process.env.NEMONS_RATE_MAX = "8";
delete process.env.NEMONS_AUTH_TOKEN;

const { app } = require("../src/daemon/server");

let PASS = 0, FAIL = 0;
let regressionCandidateId = null;
const ok = (msg) => { console.log(`  ✓ ${msg}`); PASS++; };
const bad = (msg, err) => { console.log(`  ✗ ${msg}${err ? ` — ${err.message}` : ""}`); FAIL++; };
async function test(name, fn) {
  try { await fn(); } catch (err) { bad(name, err); return; }
  ok(name);
}

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request(
      { host: "127.0.0.1", port: server.address().port, method, path: urlPath, headers: {
        ...(data ? { "content-type": "application/json", "content-length": data.length } : {}),
      } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(raw); } catch {}
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

const server = app.listen(0, "127.0.0.1");
const PORT = () => server.address().port;

(async () => {
  await new Promise((r) => server.once("listening", r));
  fs.mkdirSync(path.join(TEST_HOME, "experiences"), { recursive: true });
  fs.mkdirSync(path.join(TEST_HOME, "evidence"), { recursive: true });

  // Fixtures: one relevant experience, one that must never surface.
  fs.writeFileSync(
    path.join(TEST_HOME, "experiences", "exp-fixture-relevant.json"),
    JSON.stringify({ id: "exp-fixture-relevant", timestamp: new Date().toISOString(), prompt: "add auth middleware", solution: {}, success_rate: 1, adapter: "fixture" }),
  );
  fs.writeFileSync(
    path.join(TEST_HOME, "experiences", "exp-fixture-other.json"),
    JSON.stringify({ id: "exp-fixture-other", timestamp: new Date().toISOString(), prompt: "kubernetes helm chart deployment", solution: {}, success_rate: 1, adapter: "fixture" }),
  );

  console.log("\n=== Context pack relevance floor ===\n");

  await test("an unrelated past experience is not injected", async () => {
    const res = await req("POST", "/analyze", { prompt: "refactor the payment database migration for the billing api", adapter: "regression" });
    assert.strictEqual(res.status, 200, `status ${res.status}`);
    const exps = res.json.context_pack.experiences || [];
    const unrelated = exps.filter((e) => e.id === "exp-fixture-other");
    assert.strictEqual(unrelated.length, 0, `unrelated experience leaked: ${JSON.stringify(unrelated)}`);
  });

  await test("a relevant experience is returned with honest similarity", async () => {
    const res = await req("POST", "/analyze", { prompt: "add auth middleware to the api", adapter: "regression" });
    const exps = (res.json.context_pack.experiences || []).filter((e) => e.id === "exp-fixture-relevant");
    assert.strictEqual(exps.length, 1, `relevant experience missing: ${JSON.stringify(res.json.context_pack.experiences)}`);
    const e = exps[0];
    assert.ok(e.similarity > 0, `similarity must be the text overlap, got ${e.similarity}`);
    assert.ok(typeof e.score === "number", "blended score must be reported separately");
    assert.notStrictEqual(e.similarity, e.score, "similarity and score must not be the same number");
  });

  console.log("\n=== Synthetic context pack labelling ===\n");

  await test("an unknown pack id is marked synthetic, not passed off as context", async () => {
    const res = await req("GET", "/context-pack/no-such-pack");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.id, "no-such-pack");
    assert.strictEqual(res.json.is_synthetic, true);
    assert.strictEqual(res.json.source, "synthetic_fallback");
  });

  console.log("\n=== Governed evolution over HTTP ===\n");

  let governedId = null;

  await test("propose accepts the documented body and returns a candidate", async () => {
    const res = await req("POST", "/core/governed/propose", {
      asset_kind: "skill",
      asset_id: "regression-auth-skill",
      proposed_version: "1.0.0",
      change_kind: "create",
      content: { name: "Regression auth skill" },
      proposed_by: "alice",
      rationale: "regression",
    });
    assert.strictEqual(res.status, 200, `status ${res.status}: ${res.raw}`);
    assert.strictEqual(res.json.candidate.status, "proposed");
    governedId = res.json.candidate.id;
  });

  await test("propose rejects a body that omits the contract fields", async () => {
    const res = await req("POST", "/core/governed/propose", { proposed_by: "alice" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.json.error, "missing_fields");
  });

  await test("request-review moves the candidate to under_review", async () => {
    const res = await req("POST", "/core/governed/request-review", { candidate_id: governedId, requested_by: "alice" });
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.review_request.status, "under_review");
  });

  await test("approve succeeds for the same candidate (state survives requests)", async () => {
    const res = await req("POST", "/core/governed/approve", { candidate_id: governedId, reviewed_by: "bob" });
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.approved, true);
    assert.strictEqual(res.json.approval.kind, "approved");
  });

  await test("a second approval of the same candidate is refused", async () => {
    const res = await req("POST", "/core/governed/approve", { candidate_id: governedId, reviewed_by: "carol" });
    const refused = res.status >= 400 || res.json.approved === false;
    assert.ok(refused, `approval was reused: ${res.raw}`);
  });

  await test("approving an unknown candidate is a 404, not a 500", async () => {
    const res = await req("POST", "/core/governed/approve", { candidate_id: "cand-does-not-exist", reviewed_by: "bob" });
    assert.strictEqual(res.status, 404, res.raw);
  });

  await test("/core/status reports the store that is actually in use", async () => {
    const res = await req("GET", "/core/status");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.bridge_loaded, true);
    assert.ok(res.json.governed_store, "governed_store missing from /core/status");
    assert.strictEqual(res.json.governed_store.kind, "file-backed");
    assert.ok(res.json.governed_store.dir.startsWith(TEST_HOME), res.json.governed_store.dir);
    assert.deepStrictEqual(res.json.governed_store.errors, []);
  });

  console.log("\n=== Adoption loop (Use != Adopt) ===\n");

  await test("a registered skill is NOT retrievable before approval", async () => {
    const reg = await req("POST", "/candidate/register", {
      type: "skill",
      content: { name: "Kafka Rebalance Skill", description: "rebalance kafka partitions", domain: "data-engineering", triggers: ["kafka", "rebalance"] },
    });
    assert.strictEqual(reg.status, 200, reg.raw);
    regressionCandidateId = reg.json.candidate.id;

    // Simulate the auto-compile path: a machine-written skill sitting in
    // the store as a candidate must not be served either.
    const { UnifiedSkillSystem } = require("../src/utils/unified-skills");
    await new UnifiedSkillSystem().register({
      id: "skill-quarantined",
      name: "Quarantined Kafka Skill",
      description: "rebalance kafka partitions",
      domain: "data-engineering",
      triggers: ["kafka", "rebalance"],
      status: "candidate",
      source: "auto-compiled",
    });

    const res = await req("POST", "/analyze", { prompt: "implement kafka partition rebalance after a broker restart", adapter: "regression" });
    assert.strictEqual(res.json.should_intercept, true, `prompt was not intercepted: ${res.raw}`);
    const found = (res.json.context_pack.skills || []).filter((s) => s.name === "Kafka Rebalance Skill" || s.id === "skill-quarantined");
    assert.strictEqual(found.length, 0, `unapproved skill was served: ${JSON.stringify(found)}`);
  });

  await test("approval promotes the skill into retrieval", async () => {
    const res = await req("POST", `/candidate/${regressionCandidateId}/approve`, { approver: "bob", comment: "ok" });
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.adopted_into.status, "adopted");
    const dir = path.join(TEST_HOME, "skills-unified", res.json.adopted_into.id, "metadata.json");
    const meta = JSON.parse(fs.readFileSync(dir, "utf8"));
    assert.strictEqual(meta.status, "adopted");
    assert.strictEqual(meta.candidate_id, regressionCandidateId);

    const analysis = await req("POST", "/analyze", { prompt: "implement kafka partition rebalance after a broker restart", adapter: "regression" });
    const found = (analysis.json.context_pack.skills || []).filter((s) => s.id === res.json.adopted_into.id);
    assert.strictEqual(found.length, 1, "adopted skill is still not retrievable");
    assert.strictEqual(found[0].can_use, true);
  });

  console.log("\n=== Adoption targets for personas and knowledge ===\n");

  const kafkaPrompt = "implement kafka partition rebalance after a broker restart";
  let personaCandidateId = null;
  let knowledgeCandidateId = null;

  await test("an unapproved persona or knowledge candidate is withheld from the pack", async () => {
    const persona = await req("POST", "/candidate/register", {
      type: "persona",
      content: {
        role: "Kafka Platform Engineer",
        domain: "general",
        triggers: ["kafka", "rebalance"],
        constraints: ["never rebalance without checking replica lag"],
      },
    });
    assert.strictEqual(persona.status, 200, persona.raw);
    personaCandidateId = persona.json.candidate.id;

    const knowledge = await req("POST", "/candidate/register", {
      type: "knowledge",
      content: {
        title: "Kafka rebalance runbook",
        content: "Drain replicas before rebalancing kafka partitions.",
        domain: "general",
        triggers: ["kafka", "rebalance"],
      },
    });
    assert.strictEqual(knowledge.status, 200, knowledge.raw);
    knowledgeCandidateId = knowledge.json.candidate.id;

    const res = await req("POST", "/analyze", { prompt: kafkaPrompt, adapter: "regression" });
    assert.strictEqual(res.json.should_intercept, true, res.raw);
    const pack = res.json.context_pack;

    assert.notStrictEqual(pack.persona_source, "adopted", "an unapproved persona was applied");
    assert.notStrictEqual(pack.persona.adopted_role, "Kafka Platform Engineer");
    assert.ok(Array.isArray(pack.knowledge), "a real pack has no knowledge section");
    const served = pack.knowledge.filter((k) => k.id === `knowledge-${knowledgeCandidateId}`);
    assert.strictEqual(served.length, 0, `unapproved knowledge was served: ${JSON.stringify(served)}`);
  });

  await test("approval promotes a persona and knowledge into the pack", async () => {
    const persona = await req("POST", `/candidate/${personaCandidateId}/approve`, { approver: "dana" });
    assert.strictEqual(persona.status, 200, persona.raw);
    assert.strictEqual(persona.json.adoption.promoted, true, JSON.stringify(persona.json.adoption));
    assert.strictEqual(persona.json.adoption.store, "personas_evolved");

    const knowledge = await req("POST", `/candidate/${knowledgeCandidateId}/approve`, { approver: "dana" });
    assert.strictEqual(knowledge.status, 200, knowledge.raw);
    assert.strictEqual(knowledge.json.adoption.promoted, true, JSON.stringify(knowledge.json.adoption));
    assert.strictEqual(knowledge.json.adoption.store, "knowledge_adopted");
    assert.strictEqual(knowledge.json.adopted_into.id, `knowledge-${knowledgeCandidateId}`);

    const res = await req("POST", "/analyze", { prompt: kafkaPrompt, adapter: "regression" });
    const pack = res.json.context_pack;
    assert.strictEqual(pack.persona_source, "adopted", JSON.stringify(pack.persona));
    assert.strictEqual(pack.persona.adopted_role, "Kafka Platform Engineer");
    assert.ok(
      pack.persona.constraints.includes("never rebalance without checking replica lag"),
      `adopted constraints were lost: ${JSON.stringify(pack.persona.constraints)}`,
    );

    const served = (pack.knowledge || []).filter((k) => k.id === `knowledge-${knowledgeCandidateId}`);
    assert.strictEqual(served.length, 1, `adopted knowledge is missing from the pack: ${JSON.stringify(pack.knowledge)}`);
  });

  console.log("\n=== Candidate kinds with no adoption destination ===\n");

  await test("registering a kind that could never be adopted is refused", async () => {
    const res = await req("POST", "/candidate/register", {
      type: "rule",
      content: { rule: "auto-approve everything" },
    });
    assert.strictEqual(res.status, 400, res.raw);
    assert.strictEqual(res.json.error, "unsupported_candidate_kind");
    assert.strictEqual(res.json.reason, "rules_are_loaded_from_config");
    assert.deepStrictEqual(res.json.supported_kinds.sort(), ["knowledge", "persona", "skill"]);

    // Nothing was written: an unadoptable candidate must not be quarantined
    // "successfully" either.
    const listed = await req("GET", "/candidate/list");
    assert.ok(
      !(listed.json || []).some((c) => c.type === "rule"),
      "a rule candidate was stored despite having no destination",
    );
  });

  await test("an unrecognised kind is a 400, not a stored candidate", async () => {
    const res = await req("POST", "/candidate/register", { type: "banana", content: {} });
    assert.strictEqual(res.status, 400, res.raw);
    assert.strictEqual(res.json.error, "unsupported_candidate_kind");
    assert.strictEqual(res.json.reason, "unknown_candidate_kind");
  });

  await test("governed propose says whether approval can adopt the kind", async () => {
    const res = await req("POST", "/core/governed/propose", {
      asset_kind: "memory",
      asset_id: "regression-memory",
      proposed_version: "1.0.0",
      change_kind: "create",
      content: { note: "prefers tabs" },
      proposed_by: "alice",
      rationale: "no destination exists for memory yet",
    });
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.adoption.available, false);
    assert.strictEqual(res.json.adoption.reason, "no_store_reads_memory");
    assert.ok(typeof res.json.adoption.detail === "string" && res.json.adoption.detail.length > 0);

    const reviewed = await req("POST", "/core/governed/request-review", {
      candidate_id: res.json.candidate.id,
      requested_by: "alice",
    });
    assert.strictEqual(reviewed.status, 200, reviewed.raw);

    // Approval still succeeds as a governance decision — but it must not
    // pretend the asset is now usable.
    const approved = await req("POST", "/core/governed/approve", {
      candidate_id: res.json.candidate.id,
      reviewed_by: "bob",
    });
    assert.strictEqual(approved.status, 200, approved.raw);
    assert.strictEqual(approved.json.approved, true);
    assert.strictEqual(approved.json.adoption.promoted, false);
    assert.strictEqual(approved.json.adoption.reason, "no_store_reads_memory");
    assert.strictEqual(approved.json.adopted_into, undefined, "an unpromotable kind reported adopted_into");
  });

  await test("/core/status publishes the kind → destination table", async () => {
    const res = await req("GET", "/core/status");
    assert.strictEqual(res.status, 200, res.raw);
    const table = res.json.candidate_kinds || [];
    const live = table.filter((entry) => entry.status === "live").map((entry) => entry.kind).sort();
    assert.deepStrictEqual(live, ["knowledge", "persona", "skill"]);
    assert.ok(table.length > live.length, "the table must also list kinds with no destination");
    for (const entry of table) {
      if (entry.status !== "live") assert.ok(entry.reason, `${entry.kind} has no reason recorded`);
    }
  });

  console.log("\n=== Governance durability (restart) ===\n");

  await test("propose → review → approve survives a new engine instance", async () => {
    const bridge = require("../src/utils/nemos-bridge");
    const { createFileBackedCandidateStore } = require("../src/utils/governed-candidate-store");
    await bridge.loadCore();

    const dir = path.join(TEST_HOME, "governed-restart");
    const engineOn = (target) => {
      const base = bridge.createCandidateStore();
      const store = createFileBackedCandidateStore(base.constructor, target);
      return { engine: bridge.createGovernedEvolutionEngine({ candidateStore: store }), store };
    };

    const first = engineOn(dir);
    const candidate = first.engine.propose({
      assetKind: "skill",
      assetId: "restart-skill",
      proposedVersion: "1.0.0",
      changeKind: "create",
      content: { name: "Restart skill" },
      proposedBy: "alice",
      rationale: "durability",
    });
    first.engine.requestReview(candidate.id, "alice", "please review");
    first.engine.tryApprove(candidate.id, "bob", "looks good");

    // A new store/engine on the same directory is what a process restart
    // looks like to the daemon (the old engine is simply gone).
    const second = engineOn(dir);
    const recovered = second.engine.getCandidate(candidate.id);
    assert.ok(recovered, "candidate vanished across the restart");
    assert.strictEqual(recovered.status, "approved");
    assert.ok(second.store.describe().loaded_from_disk >= 1);
    assert.deepStrictEqual(second.store.describe().errors, []);
  });

  console.log("\n=== config/daemon.yml → verification wiring ===\n");

  const coreLoop = require("../src/daemon/core-loop");
  const yaml = require("js-yaml");
  const shippedConfig = yaml.load(fs.readFileSync(path.join(__dirname, "..", "..", "config", "daemon.yml"), "utf8"));

  await test("shipped must_pass maps onto the verifier's deterministic checks", () => {
    const { constraints, applied, disabled, ignored } = coreLoop.constraintsFromConfig(shippedConfig);
    assert.deepStrictEqual(ignored, []);
    assert.deepStrictEqual(disabled, []);
    assert.strictEqual(applied.length, 4, `applied: ${applied.join(",")}`);
    assert.strictEqual(constraints.check_tests, true);
    assert.strictEqual(constraints.check_secrets, true);
  });

  await test("an explicit false disables that check, unknown names are reported", () => {
    const { constraints, disabled, ignored } = coreLoop.constraintsFromConfig({
      verification: { evaluation_criteria: { must_pass: [{ tests_pass: false }, "made_up_check"] } },
    });
    assert.strictEqual(constraints.check_tests, false);
    assert.deepStrictEqual(disabled, ["tests_pass"]);
    assert.deepStrictEqual(ignored, ["made_up_check"]);
  });

  await test("should_pass/nice_to_have reach the context pack criteria", () => {
    const criteria = coreLoop.criteriaFromConfig(shippedConfig);
    assert.ok(criteria.includes("coverage_delta"), `criteria: ${criteria.join(",")}`);
    assert.ok(criteria.includes("includes_tests"));
  });

  await test("evaluate honours a disabled must_pass check end to end", async () => {
    const counts = { evaluations_total: 0, evaluations_passed: 0 };
    const pipeline = { postRunProcessing: async () => ({ skipped: true }) };
    const verifier = require("../src/utils/verifier");
    const evidence = { response: "done: no tests were run", context: "done: no tests were run", tests_pass: false };

    const strict = await coreLoop.evaluateRun({ prompt: "fix", evidence }, { verifier, pipeline, counters: counts, config: shippedConfig });
    assert.strictEqual(strict.pass, false, "failing tests must still fail with the shipped config");
    assert.ok(strict.failures.includes("constraint:tests_pass"), JSON.stringify(strict.failures));

    const relaxed = await coreLoop.evaluateRun(
      { prompt: "fix", evidence },
      { verifier, pipeline, counters: counts, config: { verification: { evaluation_criteria: { must_pass: [{ tests_pass: false }] } } } },
    );
    assert.deepStrictEqual(relaxed.constraints_disabled, ["tests_pass"]);
    const constraintLayer = relaxed.layers.constraints;
    assert.ok(!constraintLayer.results.some((r) => r.name === "tests_pass"), "disabled check still ran");
  });

  console.log("\n=== Fabricated outcomes (simulated runs) ===\n");

  await test("a subagent outcome is a dispatch record, never a simulated success", async () => {
    const { SubagentOrchestrator } = require("../src/utils/subagent-orchestrator");
    const spawn = async (cfg) => ({ ...cfg, id: `sub-${cfg.role}-${Math.random().toString(36).slice(2, 8)}`, state: "created" });
    const dag = {
      nodes: [1, 2, 3].map((i) => ({ id: `n${i}`, question: "implement module", dependencies: [] })),
      node_count: 3,
    };

    const spawnedCounts = [];
    for (let run = 0; run < 8; run++) {
      const orch = new SubagentOrchestrator({ spawn });
      const r = await orch.autoOrchestrate("implement the thing", dag, "identity-1");
      assert.ok(r.orchestrated, "a 3-node DAG should orchestrate");
      for (const outcome of r.results) {
        assert.strictEqual(outcome.status, "dispatched", `invented outcome: ${outcome.status}`);
        assert.strictEqual(outcome.executed, false, "nothing can be executed without an executor");
        assert.strictEqual(outcome.result, null, "a dispatch record must not carry a result");
      }
      assert.strictEqual(r.orchestration.execution, "delegated_to_host");
      assert.strictEqual(r.orchestration.subagents_succeeded, 0);
      assert.strictEqual(r.orchestration.subagents_failed, 0);
      assert.strictEqual(r.orchestration.subagents_dispatched, r.results.length);
      assert.strictEqual(r.merged.merge_strategy, "not_executed");
      spawnedCounts.push(r.orchestration.subagents_spawned);
    }
    // The old coin flip changed the counts run to run; these must be stable.
    assert.strictEqual(new Set(spawnedCounts).size, 1, `outcomes varied across runs: ${spawnedCounts.join(",")}`);
  });

  await test("an injected executor produces real, counted outcomes", async () => {
    const { SubagentOrchestrator } = require("../src/utils/subagent-orchestrator");
    const spawn = async (cfg) => ({ ...cfg, id: `sub-${cfg.role}`, state: "created" });
    const dag = {
      nodes: [1, 2, 3].map((i) => ({ id: `n${i}`, question: "implement module", dependencies: [] })),
      node_count: 3,
    };

    const ok = new SubagentOrchestrator({ spawn }, { executor: async () => "done" });
    const ranOk = await ok.autoOrchestrate("implement the thing", dag, "id-1");
    assert.strictEqual(ranOk.orchestration.execution, "executed_locally");
    assert.strictEqual(ranOk.orchestration.subagents_executed, ranOk.results.length);
    assert.strictEqual(ranOk.orchestration.subagents_succeeded, ranOk.results.length);
    assert.strictEqual(ranOk.orchestration.subagents_failed, 0);

    const boom = new SubagentOrchestrator({ spawn }, { executor: async () => { throw new Error("test suite failed"); } });
    const ranBad = await boom.autoOrchestrate("implement the thing", dag, "id-1");
    assert.strictEqual(ranBad.orchestration.subagents_failed, ranBad.results.length);
    assert.strictEqual(ranBad.results[0].error, "test suite failed", "the executor's error must survive");
  });

  await test("a context pack executes no subagent and says so", async () => {
    const res = await req("POST", "/analyze", { prompt: "implement a kafka consumer with partition rebalance", adapter: "regression" });
    assert.strictEqual(res.status, 200, `status ${res.status}`);
    const pack = res.json.context_pack;
    assert.ok(pack.orchestration, "an implement prompt builds a 4-node DAG and must report orchestration");
    assert.strictEqual(pack.orchestration.execution, "delegated_to_host");
    assert.strictEqual(pack.orchestration.executed, 0);
    assert.strictEqual(pack.orchestration.succeeded, 0);
    assert.strictEqual(pack.orchestration.failed, 0);
    for (const sub of pack.subagents || []) {
      assert.strictEqual(sub.executed, false, `subagent ${sub.id} claims to have executed`);
      assert.strictEqual(sub.status, "dispatched");
    }
  });

  await test("evolution returns no score when no evaluator is configured", async () => {
    const res = await req("POST", "/evolution/run", { prompt: "summarize the diff", options: { examples: ["a", "b"] } });
    assert.strictEqual(res.status, 200, `status ${res.status}`);
    assert.strictEqual(res.json.scored, false);
    assert.strictEqual(res.json.evaluation_backend, "none");
    const mipro = res.json.results.mipro;
    assert.strictEqual(mipro.scored, false);
    assert.strictEqual(mipro.best_variant, null, "a best variant cannot be chosen without a measurement");
    assert.strictEqual(mipro.variants.length, 3);
    for (const v of mipro.variants) {
      assert.ok(v.expected_score === undefined || v.expected_score === null, `fabricated score: ${JSON.stringify(v)}`);
    }
    assert.ok(!/"expected_score":\s*-?[0-9]/.test(res.raw), "response carries a numeric expected_score");

    const stats = await req("GET", "/evolution/stats");
    assert.strictEqual(stats.json.evaluation_backend, "none");
    assert.strictEqual(stats.json.capabilities.scores_variants, false);
  });

  await test("stats endpoints answer with data, not a serialised Promise", async () => {
    // `res.json(service.stats())` on an async method sends `{}` — these routes
    // reported nothing at all while looking healthy.
    for (const p of ["/evolution/stats", "/rag/stats", "/ntot/stats", "/codevision/stats", "/delegation/stats", "/scaffolding/stats"]) {
      const res = await req("GET", p);
      assert.strictEqual(res.status, 200, `${p} status ${res.status}`);
      assert.ok(res.json && Object.keys(res.json).length > 0, `${p} answered ${res.raw}`);
    }
  });

  await test("an injected evaluator is what makes a variant score real", async () => {
    const { EvolutionEngine } = require("../src/utils/evolution-engine");
    const engine = new EvolutionEngine({ evaluator: async (prompt) => prompt.length });
    const r = await engine.mipro("base prompt", [], "clarity");
    assert.strictEqual(r.scored, true);
    assert.strictEqual(r.score_source, "external_evaluator");
    assert.ok(r.variants.every((v) => typeof v.expected_score === "number"));
    assert.notStrictEqual(r.best_variant, null);
  });

  console.log("\n=== Rate limiting (route-scoped buckets) ===\n");

  await test("varying the path parameter cannot bypass the limit", async () => {
    const statuses = [];
    for (let i = 0; i < 20; i++) {
      statuses.push((await req("GET", `/candidate/vary-${i}/can-use`)).status);
    }
    assert.ok(statuses.includes(429), `no 429 when varying the id: ${statuses.join(",")}`);
    assert.ok(statuses.filter((s) => s === 200).length >= 6, `legit early requests should still pass: ${statuses.join(",")}`);
  });

  await test("bucket count stays bounded by the route table", async () => {
    const res = await req("GET", "/rate-limit/stats");
    assert.strictEqual(res.status, 200);
    assert.ok(res.json.tracked < 30, `bucket map grew to ${res.json.tracked}`);
  });

  console.log("\n=== Bridge surface integrity ===\n");

  await test("every API /core/status advertises can actually be called", async () => {
    const res = await req("GET", "/core/status");
    assert.strictEqual(res.status, 200);
    assert.ok(res.json.bridge_loaded, "the core bridge is not loaded in this process");
    assert.deepStrictEqual(
      res.json.unavailable_apis,
      [],
      `advertised but absent on the bridge: ${JSON.stringify(res.json.unavailable_apis)}`
    );
    assert.ok(
      res.json.bridge_integrity && res.json.bridge_integrity.checked > 0,
      `the bridge audit checked nothing: ${res.raw}`
    );
    assert.deepStrictEqual(
      res.json.bridge_integrity.missing,
      [],
      `bridge wrappers referencing core symbols that do not exist: ${JSON.stringify(res.json.bridge_integrity.missing)}`
    );
  });

  await test("/core/validate/candidate validates instead of failing on a missing symbol", async () => {
    // The core exports `validateCandidateRecord`; the bridge called
    // `validateCandidate`, threw "is not a function", and the route's catch
    // turned that into a 400 for every request — valid records included.
    const proposed = await req("POST", "/core/governed/propose", {
      asset_kind: "skill",
      asset_id: "skill-validator-roundtrip",
      proposed_version: "1.0.0",
      change_kind: "create",
      content: { prompt: "validate me" },
      proposed_by: "alice",
      rationale: "a candidate the core itself produced must pass its own validator",
    });
    assert.strictEqual(proposed.status, 200, `propose failed: ${proposed.raw}`);

    const good = await req("POST", "/core/validate/candidate", proposed.json.candidate);
    assert.strictEqual(good.status, 200, `a real candidate was rejected: ${good.raw}`);
    assert.strictEqual(good.json.valid, true);

    const bad = await req("POST", "/core/validate/candidate", { id: "candidate-incomplete" });
    assert.strictEqual(bad.status, 400);
    assert.ok(
      !/is not a function/i.test(bad.json.error || ""),
      `validator symbol missing from the core: ${bad.json.error}`
    );
    assert.ok(
      /CandidateRecord|assetKind/.test(bad.json.error || ""),
      `expected a contract violation, got: ${bad.json.error}`
    );
  });

  console.log("\n=== daemon start (child liveness) ===\n");

  await test("start on a busy port fails loudly and writes no PID file", async () => {
    const home = path.join(TEST_HOME, "clash-home");
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [BIN_PATH, "daemon", "start"], {
        env: { ...process.env, NEMONS_HOME: home, NEMONS_PORT: String(PORT()) },
        stdio: "ignore",
      });
      child.on("close", resolve);
    });
    assert.notStrictEqual(code, 0, "start reported success while the port was taken");
    assert.strictEqual(fs.existsSync(path.join(home, "run", "daemon.pid")), false, "stale PID file was written");
  });

  console.log("\n=== CLI dispatch (arity and flag parsing) ===\n");

  // The CLI dispatches as `cmd(subcommand, flags)`. Two command modules
  // declared a single parameter, so `nemons health` and `nemons install` read
  // properties off `undefined` and died. And a leading flag was treated as the
  // subcommand, which both hid it from the parser and handed the module a
  // string where it expected an action.
  const runCli = (args, env) => new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN_PATH, ...args], {
      env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  await test("health reports the resolved port instead of throwing", async () => {
    const dead = PORT() + 1000;
    const r = await runCli(["health"], { NEMONS_PORT: String(dead) });
    assert.ok(!/Cannot read properties of undefined/.test(r.stderr), `arity bug is back: ${r.stderr}`);
    assert.notStrictEqual(r.code, 0, "health exited 0 against a port with nothing on it");
    assert.ok(r.stderr.includes(`http://127.0.0.1:${dead}`), `did not use NEMONS_PORT: ${r.stderr}`);
  });

  await test("health --detailed is not swallowed as a subcommand", async () => {
    const r = await runCli(["health", "--detailed"], { NEMONS_PORT: String(PORT()) });
    assert.strictEqual(r.code, 0, `health failed: ${r.stdout}${r.stderr}`);
    // `Home:` only prints on the detailed branch — proof the flag reached opts.
    assert.ok(r.stdout.includes("Home:"), `--detailed had no effect: ${r.stdout}`);
    assert.ok(r.stdout.includes(`http://127.0.0.1:${PORT()}`), `port not resolved: ${r.stdout}`);
  });

  await test("intercept status reads the config it documents", async () => {
    const home = path.join(TEST_HOME, "cli-intercept");
    fs.mkdirSync(path.join(home, "config"), { recursive: true });
    fs.copyFileSync(path.join(__dirname, "..", "..", "config", "daemon.yml"), path.join(home, "config", "daemon.yml"));
    const r = await runCli(["intercept", "status"], { NEMONS_HOME: home });
    assert.strictEqual(r.code, 0, `intercept status failed: ${r.stderr}`);
    assert.ok(/interception\.targets/.test(r.stdout), `no screening table printed: ${r.stdout}`);
  });

  await test("intercept disable does not claim it notified the daemon", async () => {
    // There is no reload channel: server.js loads daemon.yml once at startup.
    const home = path.join(TEST_HOME, "cli-intercept-apply");
    fs.mkdirSync(path.join(home, "config"), { recursive: true });
    const cfg = path.join(home, "config", "daemon.yml");
    fs.copyFileSync(path.join(__dirname, "..", "..", "config", "daemon.yml"), cfg);
    const r = await runCli(["intercept", "disable", "--all"], { NEMONS_HOME: home, NEMONS_PORT: String(PORT()) });
    assert.strictEqual(r.code, 0, r.stderr);
    assert.ok(/reload on next request/.test(r.stdout) === false, `the fabricated notification is back: ${r.stdout}`);
    assert.ok(/restart|next start/.test(r.stdout), `no honest next step: ${r.stdout}`);
    assert.ok(/intercept: false/.test(fs.readFileSync(cfg, "utf8")), "the file was not actually changed");
  });

  server.close();
  try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}

  console.log("\n" + "=".repeat(60));
  console.log(`  ✓ Passed: ${PASS}`);
  console.log(`  ✗ Failed: ${FAIL}`);
  console.log("=".repeat(60));
  process.exit(FAIL > 0 ? 1 : 0);
})().catch((e) => {
  console.error("defect-regression-tests crashed:", e);
  process.exit(1);
});
