// ============================================================
// 4-Layer Verification — Architecture-Correct (v2.5.1)
// Based on: arXiv:2408.11729 + arXiv:2603.11445
// v2.5.1 FIX: Nemos NEVER calls LLM directly.
// LLM-as-a-Judge builds a "judge prompt" that gets sent
// THROUGH the coding agent's adapter (not direct API call).
// ============================================================

// Every layer reports a tri-state `status`: "pass" (checked and held),
// "fail" (checked and failed), "inconclusive" (nothing to check — e.g.
// no response/context supplied). Only a definitive "fail" blocks the
// overall verdict; "inconclusive" is recorded, never silently counted
// as a failure.
const PASS = "pass", FAIL = "fail", INCONCLUSIVE = "inconclusive";

// Layer 1: Grounding Check (pure text analysis — no LLM needed)
function groundingCheck(response, context) {
  if (!response || !context) {
    // Nothing to ground — that is unknown, not failed. Gating on this
    // as a hard fail made every evidence-only verification return
    // pass:false regardless of its deterministic evidence.
    return { status: INCONCLUSIVE, reason: "missing_response_or_context", ratio: 0, layer: "grounding", method: "text_overlap" };
  }
  const responseTokens = new Set(response.toLowerCase().split(/\s+/).filter(t => t.length > 4));
  const contextTokens = new Set(context.toLowerCase().split(/\s+/).filter(t => t.length > 4));
  let groundedCount = 0, totalCount = 0;
  for (const token of responseTokens) {
    totalCount++;
    if (contextTokens.has(token)) groundedCount++;
  }
  const groundingRatio = totalCount > 0 ? groundedCount / totalCount : 0;
  const pass = groundingRatio > 0.5;
  return {
    pass,
    status: pass ? PASS : FAIL,
    ratio: Math.round(groundingRatio * 100) / 100,
    checked_tokens: totalCount, grounded_tokens: groundedCount,
    layer: "grounding", method: "text_overlap",
  };
}

// Layer 2: Self-Consistency Check
async function selfConsistencyCheck(evidence, options) {
  const opts = options || {};
  const threshold = opts.threshold || 0.7;
  if (!evidence || !evidence.test_results) {
    return { pass: true, status: INCONCLUSIVE, reason: "no_tests_to_check", samples: 0, layer: "self_consistency", method: "test_consistency" };
  }
  const consistent = evidence.test_results.passed === true;
  const ratio = consistent ? 1.0 : 0.0;
  const pass = ratio >= threshold;
  return { pass, status: pass ? PASS : FAIL, ratio, samples: opts.samples || 3, reason: consistent ? "tests_consistent" : "tests_inconsistent", layer: "self_consistency", method: "test_consistency" };
}

// Layer 3: LLM-as-a-Judge
// v2.5.1 ARCHITECTURAL FIX:
// Nemos does NOT call LLM API directly.
// Instead, it builds a "judge prompt" that the caller
// sends THROUGH the coding agent's adapter.
// The coding agent evaluates using its OWN LLM.
async function llmJudge(params) {
  const { prompt, response, criteria, evidence } = params;
  
  // Build the judge prompt (this gets sent to the coding agent, NOT to an LLM API)
  const judgePrompt = buildJudgePrompt(prompt, response, criteria, evidence);
  
  // Use heuristic evaluation (always available — no external dependency)
  const heuristicResult = heuristicJudge(prompt, response, criteria, evidence);
  
  return {
    ...heuristicResult,
    judge_prompt: judgePrompt,  // Available for the caller to send via adapter
    method: "heuristic_with_adapter_prompt",
    note: "Judge prompt built. Caller should send it through coding agent adapter for LLM evaluation.",
    layer: "llm_judge",
  };
}

// Build a judge prompt that can be sent to the coding agent via adapter
function buildJudgePrompt(prompt, response, criteria, evidence) {
  const criteriaStr = (criteria || []).join(", ") || "correctness, completeness, security";
  const evidenceStr = evidence ? JSON.stringify({
    tests_pass: evidence.tests_pass,
    no_syntax_errors: evidence.no_syntax_errors,
    no_security_violations: evidence.no_security_violations,
  }) : "{}";
  
  return `You are an expert code reviewer. Evaluate the following:

## Original Prompt
${prompt || "N/A"}

## Response to Evaluate
${response || "N/A"}

## Success Criteria
${criteriaStr}

## Evidence
${evidenceStr}

Rate on 0.0-1.0 for: correctness, completeness, security, code quality.
Return JSON: {"pass": boolean, "score": number, "reasoning": "string"}`;
}

// Heuristic judge (always available — no LLM needed)
function heuristicJudge(prompt, response, criteria, evidence) {
  const checks = [];
  const responseLower = (response || "").toLowerCase();
  
  // Check 1: Addresses prompt
  const promptKeywords = (prompt || "").toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const addressedKeywords = promptKeywords.filter(k => responseLower.includes(k));
  const addressesPrompt = promptKeywords.length === 0 || (addressedKeywords.length / promptKeywords.length) > 0.5;
  checks.push({ name: "addresses_prompt", pass: addressesPrompt, score: promptKeywords.length > 0 ? addressedKeywords.length / promptKeywords.length : 1.0 });
  
  // Check 2: Criteria met
  if (criteria && Array.isArray(criteria)) {
    const criteriaMet = criteria.filter(c => responseLower.includes(c.toLowerCase().split(/\s+/)[0]));
    checks.push({ name: "criteria_met", pass: criteriaMet.length / criteria.length > 0.7, score: criteriaMet.length / criteria.length });
  }
  
  // Check 3: Evidence consistent
  if (evidence) {
    const testsPass = evidence.tests_pass === true;
    const noSyntaxErrors = evidence.no_syntax_errors !== false;
    checks.push({ name: "evidence_consistent", pass: testsPass && noSyntaxErrors, score: (testsPass ? 0.5 : 0) + (noSyntaxErrors ? 0.5 : 0) });
  }
  
  const allPassed = checks.every(c => c.pass);
  const avgScore = checks.reduce((s, c) => s + c.score, 0) / checks.length;

  return { pass: allPassed, status: allPassed ? PASS : FAIL, score: Math.round(avgScore * 100) / 100, checks, judge_id: "heuristic_v1", method: "heuristic" };
}

// Layer 4: Constraint Verification (deterministic)
function constraintCheck(evidence, constraints) {
  const results = [];
  if (constraints?.check_schema !== false) results.push({ name: "schema_valid", pass: evidence.no_syntax_errors !== false, severity: "coercive", layer: "constraints" });
  if (constraints?.check_policy !== false) results.push({ name: "policy_compliant", pass: evidence.no_security_violations !== false, severity: "coercive", layer: "constraints" });
  if (constraints?.check_secrets !== false) results.push({ name: "no_secrets", pass: evidence.no_secrets_in_diff !== false, severity: "coercive", layer: "constraints" });
  if (constraints?.check_tests !== false) results.push({ name: "tests_pass", pass: evidence.tests_pass === true, severity: "coercive", layer: "constraints" });
  if (constraints?.check_coverage !== false) { const delta = evidence.coverage_delta; results.push({ name: "coverage_maintained", pass: delta === undefined || delta >= 0, severity: "normative", layer: "constraints" }); }
  if (constraints?.check_diff_size !== false) { const diffSize = evidence.diff_size || 0; results.push({ name: "diff_reasonable", pass: diffSize < 500, severity: "normative", layer: "constraints" }); }
  const coerciveFailed = results.filter(r => r.severity === "coercive" && !r.pass).map(r => r.name);
  return {
    pass: results.every(r => r.pass),
    status: coerciveFailed.length > 0 ? FAIL : PASS,
    failed_coercive: coerciveFailed,
    results, layer: "constraints", method: "deterministic",
  };
}

// Main: Run all 4 layers
async function verify(params) {
  const { prompt, response, context, criteria, evidence, constraints } = params;
  const grounding = groundingCheck(response, context);
  const consistency = await selfConsistencyCheck(evidence);
  const judge = await llmJudge({ prompt, response, criteria, evidence });
  const constraints_result = constraintCheck(evidence, constraints || {});
  const layerList = [grounding, consistency, judge, constraints_result];
  const anyFail = layerList.some(l => l.status === FAIL);
  const inconclusiveLayers = layerList.filter(l => l.status === INCONCLUSIVE).map(l => l.layer);
  const failures = [
    ...constraints_result.failed_coercive.map(name => `constraint:${name}`),
    ...layerList.filter(l => l.status === FAIL && l !== constraints_result).map(l => l.layer),
  ];
  const pass = !anyFail;
  return {
    pass,
    passed: pass, // alias kept for older consumers; `pass` is canonical
    verdict: pass ? (inconclusiveLayers.length > 0 ? "pass_with_inconclusive_layers" : "pass") : "fail",
    inconclusive_layers: inconclusiveLayers,
    failures,
    layers: { grounding, self_consistency: consistency, llm_judge: judge, constraints: constraints_result },
    // v2.5.1: No llm_used flag (Nemos never calls LLM directly)
    judge_id: judge.judge_id,
    judge_prompt_available: !!judge.judge_prompt,  // Caller can send via adapter
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  groundingCheck, selfConsistencyCheck, llmJudge, constraintCheck, verify,
  _heuristicJudge: heuristicJudge,
  _buildJudgePrompt: buildJudgePrompt,
};
