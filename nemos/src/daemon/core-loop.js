// ============================================================
// Core product loop — the ONE implementation of the four steps
// every consumer (HTTP routes AND the MCP server) shares:
//
//   analyze → collect evidence → evaluate → store experience
//
// Extracted from server.js so the MCP tools can never drift from
// the HTTP API: same filters, same guards, same counters, same
// shapes. HTTP layers map these results to res.status().json();
// the MCP layer maps them to structuredContent / isError.
// ============================================================
const path = require("path");
const { isSafeId, resolveWithin } = require("../utils/path-guard");

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// POST /analyze · nemons.analyze_prompt
async function analyzePrompt({ prompt, adapter } = {}, ctx) {
  const filters = require("../utils/filters");
  const filterResult = filters.shouldIntercept(prompt);
  if (!filterResult.should_intercept) {
    return { should_intercept: false, reason: filterResult.reason };
  }
  try {
    const dynamicPack = await ctx.pipeline.buildContextPack(prompt, adapter);
    ctx.counters.intercepts++;
    return {
      should_intercept: true,
      reason: filterResult.reason,
      pattern: filterResult.pattern,
      suggested_pack_id: dynamicPack.suggested_pack_id,
      context_pack: dynamicPack.context_pack,
      pipeline: "integrated",
      components_used: dynamicPack.components_used,
      message: "Dynamic Context Pack built with persona + skills + experiences + harness + subagents",
    };
  } catch (e) {
    // Fallback to static pack if pipeline fails
    return {
      should_intercept: true,
      reason: filterResult.reason,
      suggested_pack_id: "default",
      pipeline: "fallback",
      error: e.message,
    };
  }
}

// POST /evidence · nemons.collect_evidence
// Returns { status, body } — status is the HTTP status the caller
// should use (MCP callers treat non-200 as isError).
async function collectEvidence({ run_id, evidence } = {}, ctx) {
  if (!run_id) {
    return { status: 400, body: { error: "run_id is required" } };
  }
  if (!isSafeId(run_id)) {
    return {
      status: 400,
      body: {
        error: "invalid_run_id",
        detail: "run_id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
      },
    };
  }
  const evidencePath = resolveWithin(ctx.NEMONS_HOME, "evidence", `${run_id}.json`);
  if (!evidencePath) {
    return { status: 400, body: { error: "invalid_run_id", detail: "path escapes NEMONS_HOME" } };
  }
  const redacted = ctx.redactSecrets(evidence || {});
  // Atomic write — a crash mid-write must not corrupt the record
  await require("../store/storage").writeAtomic(evidencePath, JSON.stringify(redacted, null, 2));
  ctx.counters.evidence_stored++;
  return { status: 200, body: { stored: true, run_id, redacted: true } };
}

// POST /evaluate · nemons.evaluate_run
async function evaluateRun({ run_id, evidence, prompt, adapter } = {}, ctx) {
  const result = await ctx.verifier.verify({
    prompt: prompt || "",
    response: evidence?.response || "",
    context: evidence?.context || "",
    evidence: evidence || {},
  });
  ctx.counters.evaluations_total++;
  if (result.pass) ctx.counters.evaluations_passed++;

  // If passed → auto-compile experience to skill (v4.0.0 pipeline)
  if (result.pass) {
    try {
      const postRun = await ctx.pipeline.postRunProcessing({
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
  return result;
}

// POST /experiences · nemons.store_experience
async function storeExperience(data = {}, ctx) {
  const expId = `exp-${uuidv4().slice(0, 8)}`;
  const expPath = path.join(ctx.NEMONS_HOME, "experiences", `${expId}.json`);
  const record = {
    id: expId,
    timestamp: new Date().toISOString(),
    ...data,
  };
  await require("../store/storage").writeAtomic(expPath, JSON.stringify(record, null, 2));
  return { stored: true, id: expId };
}

// GET /context-pack/:id · nemons.get_context_pack
// Returns { status, body } like collectEvidence.
async function getContextPack(id, ctx) {
  if (!isSafeId(id)) {
    return {
      status: 400,
      body: {
        error: "invalid_id",
        detail: "id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
      },
    };
  }
  const packPath = resolveWithin(ctx.NEMONS_HOME, "context-packs", `${id}.yml`);
  if (!packPath) {
    return { status: 400, body: { error: "invalid_id", detail: "path escapes NEMONS_HOME" } };
  }
  const fs = require("fs").promises;
  const yaml = require("js-yaml");
  try {
    const raw = await fs.readFile(packPath, "utf8");
    return { status: 200, body: yaml.load(raw) };
  } catch {
    // Default pack when the specific one does not exist (unchanged HTTP contract)
    return {
      status: 200,
      body: {
        id,
        persona: {
          role: "Senior Engineer",
          constraints: ["Follow project conventions", "Write tests for new code"],
        },
        skills: [],
        knowledge: ["Project uses best practices"],
        success_criteria: ["Code passes tests", "No new lint warnings"],
      },
    };
  }
}

module.exports = { analyzePrompt, collectEvidence, evaluateRun, storeExperience, getContextPack };
