# ADR-0013 — Paired Baseline Evaluation (from VERA + "What Does a Harness Buy?")

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Sources:** VERA (https://arxiv.org/abs/2610.05923) + What Does a Harness Buy? (https://arxiv.org/abs/2610.04433)

## Context

Two research papers converge on the need for paired baseline evaluation:

**VERA** (Liu et al., Oct 2026): "a verifier that gates model checkpoints and harness edits using explicit development-set acceptance criteria." VERA alternates between training and harness edits, with paired evaluation to determine whether changes improve over the baseline.

**What Does a Harness Buy?** (Liu & Han, Oct 2026): "run-to-run variation is 13% — swapping harnesses flips as many tasks as rerunning the same harness." Without paired evaluation against a baseline, you can't distinguish real improvement from noise.

**Current gap:** Nemons evaluates each Run independently. There's no mechanism to:
- Compare a Run's metrics against a baseline Run's metrics.
- Compute the delta (cost, latency, correctness) between two Runs.
- Detect whether a change is within the 13% noise band or a real improvement.

ADR-0011 (Run Metrics) provides the per-Run metrics infrastructure. Paired evaluation builds ON TOP of that: given two Runs (baseline + candidate), compute the delta and determine if the change is significant.

## Decision

Add a **`BaselineComparison`** type and a **`PairedEvaluator`** component that:
1. Takes two Runs (baseline + candidate).
2. Computes metric deltas (latency, cost, tokens, tool calls, steps).
3. Compares outcomes (both succeeded? both failed? different?).
4. Detects whether the delta is within a configurable noise threshold.
5. Returns a structured comparison report.

### BaselineComparison Fields

| Field | Type | Description |
|-------|------|-------------|
| `baselineRunId` | string | The baseline Run's id |
| `candidateRunId` | string | The candidate Run's id |
| `outcomeComparison` | `"same" \| "improved" \| "regressed" \| "inconclusive"` | How the outcomes compare |
| `metricDeltas` | `MetricDelta` | Per-metric delta values |
| `withinNoiseBand` | boolean | Whether the delta is within the 13% noise threshold |
| `noiseThresholdPct` | number | The noise threshold percentage used (default: 13) |
| `summary` | string | Human-readable comparison summary |
| `comparedAt` | string | ISO timestamp |

### MetricDelta Fields

| Field | Type | Description |
|-------|------|-------------|
| `latencyMs?` | `{baseline, candidate, delta, deltaPct}` | Latency comparison |
| `costUsd?` | `{baseline, candidate, delta, deltaPct}` | Cost comparison |
| `tokenCount?` | `{baseline, candidate, delta, deltaPct}` | Token comparison |
| `toolCallCount?` | `{baseline, candidate, delta, deltaPct}` | Tool call comparison |
| `stepCount?` | `{baseline, candidate, delta, deltaPct}` | Step count comparison |

### What This Does NOT Do

- Does NOT require repeated Runs (single-pair comparison is supported).
- Does NOT use statistical significance testing (the 13% threshold is a heuristic from the paper).
- Does NOT modify the Run schema or Evaluation engine.
- Does NOT require external services or LLM.
- Does NOT replace deterministic verification with probabilistic comparison.

## Rationale

1. **Research-backed**: VERA gates changes with acceptance criteria; "What Does a Harness Buy?" quantifies the 13% noise band.
2. **Builds on ADR-0011**: uses RunMetrics fields for delta computation.
3. **Enables Priority 1**: paired evaluation is essential for evaluation reliability.
4. **Low risk**: read-only component, no state mutation, no schema changes.
5. **Fits authorization**: within Stage C scope (ADR-0006).
