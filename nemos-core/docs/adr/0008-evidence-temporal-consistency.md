# ADR-0008 — Evidence Temporal Consistency Check (from LongHarness research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** LongHarness (https://arxiv.org/abs/2610.13075)

## Context

LongHarness (Huang et al., Oct 2026) studied long-context agentic reasoning over large corpora. It identified a failure mode called **evidence-state drift**:

> "Previously acquired evidence or subsequent corrections fail to inform the current conclusion."

The paper proposes **Evidence Lifecycle Management** as a mechanism to "keep accumulated evidence current and traceable throughout the interaction."

Nemons' current Evaluation engine (Stage 0 + B + ADR-0007) checks:
1. Does verified Evidence of the required kind exist? (Stage 0)
2. Do the Evidence records agree? (ADR-0007 — consistency check)

**Gap:** The engine does NOT check whether the Evidence was recorded WITHIN the Run's lifecycle. If an Evidence record was:
- Recorded BEFORE the Run started → it can't support claims about THIS Run (it's from a different execution)
- Recorded AFTER the Run ended → it might be from a post-hoc analysis or a different Run

This is "evidence-state drift" in Nemons' context: Evidence that doesn't temporally correspond to the Run it's being evaluated against.

## Decision

Add an **Evidence Temporal Consistency Check** to the Evaluation engine. For each verified Evidence record, the engine checks:

1. If `run.startedAt` is set and `evidence.recordedAt < run.startedAt` → the Evidence is **stale** (recorded before the Run started).
2. If `run.endedAt` is set and `evidence.recordedAt > run.endedAt` → the Evidence is **stale** (recorded after the Run ended).
3. Otherwise → the Evidence is **temporally consistent** with the Run.

### Processing Order

The temporal consistency check runs BEFORE the disagreement check (ADR-0007):

```
1. Filter to verified Evidence
2. Filter out temporally inconsistent (stale) Evidence
3. Check for disagreement among the remaining Evidence
4. Criterion is satisfied if non-stale, non-disagreeing Evidence exists
```

This layered approach means:
- Stale Evidence is EXCLUDED from the criterion check (not counted)
- If excluding stale Evidence leaves no qualifying Evidence, the criterion is not satisfied
- A limitation is recorded listing the stale Evidence
- If the stale Evidence was the source of disagreement, removing it might resolve the disagreement

### What This Does NOT Do

- Does NOT require external artifact verification (no network, no file system access)
- Does NOT modify existing schemas (Evidence, Evaluation, Run)
- Does NOT change the Evaluation engine's public API
- Does NOT require LLM or semantic analysis
- Does NOT weaken any existing test or authorization boundary

### Interaction with ADR-0007

When both checks are active:
1. Temporal consistency runs first — excludes stale Evidence
2. Disagreement check runs on the remaining (temporally consistent) Evidence
3. If stale Evidence was the only source of disagreement, removing it may allow `verified_succeeded`

This is the CORRECT behavior: stale Evidence shouldn't cause a disagreement that blocks verification.

## Rationale

1. **Research-backed**: LongHarness's evidence-state drift is a well-documented failure mode. The temporal consistency check directly addresses it.
2. **Architecturally aligned**: strengthens "Evidence before claims" (ADR-0004) by adding a temporal dimension. Evidence must not only exist and agree — it must also be temporally relevant to the Run.
3. **Low risk**: additive change, no schema modifications, no API changes.
4. **Fits authorization**: within Stage C scope (ADR-0006). No external services, no LLM, no network.
5. **Clear acceptance criteria**: when Evidence is recorded outside the Run's lifecycle, it's excluded and a limitation is recorded.

## Compliance

- All existing tests continue to pass (the check is additive — when Evidence is temporally consistent, behavior is unchanged).
- New tests verify the temporal consistency behavior.
- The check is internal to the Evaluation engine (no public API change).
- The architectural invariants are preserved (the check STRENGTHENS verification, not weakens it).
- Layered with ADR-0007 (disagreement check): temporal check runs first.
