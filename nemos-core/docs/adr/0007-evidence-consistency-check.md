# ADR-0007 — Evidence Consistency Check (from VeriHarness research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** VeriHarness (https://arxiv.org/abs/2610.00972)

## Context

VeriHarness (Zhang et al., Oct 2026) studied verification of long-horizon agent tasks. Its key finding:

> "Disagreement often exposes correct alternatives, while consensus can conceal errors."

The paper shows that when multiple rollouts of an agent disagree, the disagreed-upon claims often contain the correct answer. When they agree (consensus), they may all share the same error. The paper proposes a disagreement resolver and consensus challenger.

Nemons' current Evaluation engine (Stage 0 + B) checks:
1. For each criterion, does verified Evidence of the required kind exist?
2. If all required criteria are satisfied → `verified_succeeded`.

**Gap:** The engine does NOT check whether multiple Evidence records of the same kind AGREE or DISAGREE. If two `test_result` Evidence records exist — one claiming "tests pass" and another claiming "tests fail" — the current engine treats both as satisfying the criterion, potentially producing `verified_succeeded` despite contradictory evidence.

## Decision

Add an **Evidence Consistency Check** to the Evaluation engine. When multiple verified Evidence records of the same kind exist, the engine checks if their claims are contradictory. If they are, the Evaluation:

1. Records a `disagreement_detected` limitation.
2. Marks the affected criterion as NOT satisfied (even if Evidence of the right kind exists).
3. The `overallResult` becomes `inconclusive` (not `verified_succeeded`) when a required criterion has disagreement.

### Contradiction Detection (Heuristic)

The check uses a keyword-based heuristic (not semantic analysis — no LLM required):

- **Positive keywords**: `pass`, `succeed`, `ok`, `true`, `passed`, `succeeded`
- **Negative keywords**: `fail`, `error`, `false`, `failed`

Two Evidence records are contradictory if:
- One's `claim` field contains a positive keyword (and no negative keyword)
- The other's `claim` field contains a negative keyword (and no positive keyword)

This is conservative: it only flags clear contradictions. It does NOT flag:
- Evidence records with the same claim (consistent)
- Evidence records with different but non-contradictory claims (e.g., "tests pass" vs "build ok")
- Evidence records with no keyword match

### What This Does NOT Do

- Does NOT introduce LLM-based verification (deferred — requires external model).
- Does NOT modify existing schemas (Evidence, Evaluation).
- Does NOT change the Evaluation engine's public API.
- Does NOT weaken any existing test or authorization boundary.
- Does NOT require network access or new dependencies.

## Rationale

1. **Research-backed**: VeriHarness's disagreement-detection insight is well-evidenced (5 benchmarks, 2 frontier models, 26K rollouts).
2. **Architecturally aligned**: strengthens "Evidence before claims" (ADR-0004) by adding a new verification dimension.
3. **Low risk**: additive change, no schema modifications, no API changes.
4. **Fits authorization**: within Stage C scope (ADR-0006). No external services, no LLM, no network.
5. **Clear acceptance criteria**: disagreement detection is testable and measurable.

## Compliance

- All existing tests continue to pass (the check is additive — when Evidence agrees, behavior is unchanged).
- New tests verify the disagreement-detection behavior.
- The check is internal to the Evaluation engine (no public API change).
- The architectural invariants are preserved (the check STRENGTHENS verification, not weakens it).
