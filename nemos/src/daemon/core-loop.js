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

// ---- config/daemon.yml → verifier wiring ---------------------
// `verification.evaluation_criteria` used to be pure documentation:
// must_pass never reached the verifier, and should_pass/nice_to_have
// never reached a context pack.
const CONSTRAINT_FLAGS = {
  tests_pass: "check_tests",
  no_syntax_errors: "check_schema",
  no_security_violations: "check_policy",
  no_secrets_in_diff: "check_secrets",
  coverage_delta: "check_coverage",
  diff_size: "check_diff_size",
};

function criterionName(entry) {
  if (typeof entry === "string") return entry.split(":")[0].trim();
  if (entry && typeof entry === "object") return Object.keys(entry)[0];
  return null;
}

function listCriteria(config, group) {
  const entries = config?.verification?.evaluation_criteria?.[group];
  return Array.isArray(entries) ? entries.map(criterionName).filter(Boolean) : [];
}

// `must_pass` is additive on purpose: a listed check is enforced, everything
// else keeps its default so config can never silently switch off a safety
// check by omission. `- tests_pass: false` is the explicit opt-out. Names the
// daemon cannot map are returned so callers can report them instead of
// pretending the config was honoured.
function constraintsFromConfig(config) {
  const entries = config?.verification?.evaluation_criteria?.must_pass;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { constraints: undefined, applied: [], disabled: [], ignored: [] };
  }
  const constraints = {};
  const applied = [];
  const disabled = [];
  const ignored = [];
  for (const entry of entries) {
    const name = criterionName(entry);
    const value = typeof entry === "object" && entry !== null ? entry[name] : true;
    const flag = name ? CONSTRAINT_FLAGS[name] : undefined;
    if (!flag) {
      if (name) ignored.push(name);
      continue;
    }
    if (value === false) {
      constraints[flag] = false;
      disabled.push(name);
    } else {
      constraints[flag] = true;
      applied.push(name);
    }
  }
  if (applied.length === 0 && disabled.length === 0) {
    return { constraints: undefined, applied, disabled, ignored };
  }
  return { constraints, applied, disabled, ignored };
}

function criteriaFromConfig(config) {
  return [...new Set([...listCriteria(config, "should_pass"), ...listCriteria(config, "nice_to_have")])];
}

// POST /analyze · nemons.analyze_prompt
async function analyzePrompt({ prompt, adapter } = {}, ctx = {}) {
  const filters = require("../utils/filters");
  // config/interception/filters is honoured now. Previously the daemon
  // always used filters.js DEFAULT_CONFIG and the 40-line YAML block was
  // decorative, so changing it in config/daemon.yml did nothing.
  const configured = ctx.config?.interception?.filters;
  const activeFilters = configured
    ? {
        ...filters.DEFAULT_CONFIG,
        ...configured,
        // not policy: the code-intent vocabulary is part of the detector
        code_keywords: filters.DEFAULT_CONFIG.code_keywords,
      }
    : filters.DEFAULT_CONFIG;
  const filterResult = filters.shouldIntercept(prompt, activeFilters);
  if (!filterResult.should_intercept) {
    return { should_intercept: false, reason: filterResult.reason };
  }
  try {
    const dynamicPack = await ctx.pipeline.buildContextPack(prompt, adapter);
    // Surface the configured criteria next to the persona/harness ones so
    // the adapter actually sees what the run will be judged against.
    const configuredCriteria = criteriaFromConfig(ctx.config);
    if (configuredCriteria.length > 0 && dynamicPack.context_pack && typeof dynamicPack.context_pack === "object") {
      const existing = Array.isArray(dynamicPack.context_pack.success_criteria) ? dynamicPack.context_pack.success_criteria : [];
      dynamicPack.context_pack.success_criteria = [...new Set([...existing, ...configuredCriteria])];
      dynamicPack.context_pack.success_criteria_source = "config:verification.evaluation_criteria";
    }
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
  const { constraints, applied, disabled, ignored } = constraintsFromConfig(ctx.config);
  const result = await ctx.verifier.verify({
    prompt: prompt || "",
    response: evidence?.response || "",
    context: evidence?.context || "",
    evidence: evidence || {},
    constraints,
  });
  // Empty `applied` means the default (all deterministic checks on), which
  // is what a missing/empty must_pass list has always meant.
  result.constraints_applied = applied;
  if (disabled.length > 0) result.constraints_disabled = disabled;
  if (ignored.length > 0) result.constraints_ignored = ignored;
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
    // Unchanged HTTP contract: an unknown id still returns 200 with a pack.
    // But it must not masquerade as curated context — callers get an
    // explicit marker saying this content was synthesized, not retrieved.
    return {
      status: 200,
      body: {
        id,
        is_synthetic: true,
        source: "synthetic_fallback",
        note: `No context pack '${id}' exists under NEMONS_HOME/context-packs. This is a synthetic default, not project context.`,
        persona: {
          role: "Senior Engineer",
          constraints: ["Follow project conventions", "Write tests for new code"],
        },
        skills: [],
        // Object shape matches a real pack's knowledge section — a bare
        // string list here would break every consumer that reads `.title`.
        knowledge: [
          { id: "synthetic-knowledge", title: "Project uses best practices", source: "synthetic_fallback" },
        ],
        success_criteria: ["Code passes tests", "No new lint warnings"],
      },
    };
  }
}

module.exports = {
  analyzePrompt,
  collectEvidence,
  evaluateRun,
  storeExperience,
  getContextPack,
  constraintsFromConfig,
  criteriaFromConfig,
};
