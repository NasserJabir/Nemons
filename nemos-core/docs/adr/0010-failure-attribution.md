# ADR-0010 — Failure Attribution (from MAST research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** MAST (https://arxiv.org/abs/2503.13657)

## Context

MAST (Cemri et al., Mar 2025) studied why Multi-Agent LLM Systems fail. It built a failure taxonomy with 14 unique failure modes across 3 categories, validated by expert annotators (kappa=0.88) on 1600+ traces.

**Key insight for Nemons:** When a Run fails, the failure should be attributed to a specific cause — not just recorded as free-text. "A failure is not automatically a Skill failure." The failure could be caused by the model, the harness, a tool, the knowledge, the policy, the environment, or remain unknown.

**Current gap:** Nemons' `markFailed(runId, reason)` takes a free-text reason. There's no structured attribution. This means:
- Offline skill refinement can't distinguish "the Skill was wrong" from "the model produced a bad output" from "the tool failed."
- Failure analysis requires manual reading of free-text reasons.
- Regression testing can't filter failures by attribution category.

## Decision

Add a **`FailureAttribution`** type to the Run schema, with categories adapted from MAST for single-agent scenarios:

```
type FailureAttributionCategory =
  | "model"         // the model produced an incorrect/suboptimal output
  | "harness"       // the adapter/harness misconfigured or failed
  | "skill"         // the selected Skill was wrong or poorly designed
  | "knowledge"     // the retrieved knowledge was wrong or incomplete
  | "tool"          // a tool call failed or returned wrong results
  | "policy"        // the policy denied or allowed incorrectly
  | "environment"   // the execution environment failed
  | "unknown"       // the cause couldn't be determined
```

The `FailureAttribution` record includes:
- `category`: the attribution category
- `description`: human-readable description
- `evidenceRefs?`: optional Evidence references supporting the attribution
- `attributedBy`: who/what made the attribution

The `failureAttribution?` field is added to `Run` as an optional field, set when `state = "failed"`.

### What This Does NOT Do

- Does NOT automatically attribute failures (requires the caller to provide the attribution).
- Does NOT use an LLM to classify failures (deferred — requires external model).
- Does NOT modify the Run state machine.
- Does NOT change the Evaluation engine.
- Does NOT weaken any existing test or authorization boundary.

### Adaptation from MAST

MAST's original taxonomy has 14 modes in 3 categories (system design, inter-agent misalignment, task verification). Nemons is single-agent, so inter-agent misalignment is not applicable. The adaptation focuses on the attribution dimensions the user specified: model, harness, skill, knowledge, tool, policy, environment, unknown.

## Rationale

1. **Research-backed**: MAST analyzed 1600+ traces with kappa=0.88.
2. **Enables Priority 2**: correct failure attribution is a prerequisite for offline skill refinement.
3. **Low risk**: additive, optional field. Doesn't change existing behavior.
4. **Fits authorization**: within Stage C scope (ADR-0006).
5. **Clear acceptance criteria**: when a Run fails with an attribution, the attribution is persisted and queryable.

## Compliance

- All existing tests continue to pass (the field is optional and additive).
- New tests verify the attribution behavior.
- The architectural invariants are preserved.
