# ADR-0011 — Run Metrics (from "What Does a Harness Buy?" research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Senior Research Engineer  
**Research Source:** What Does a Harness Buy? Tokens, Mostly (https://arxiv.org/abs/2610.04433)

## Context

"What Does a Harness Buy? Tokens, Mostly" (Liu & Han, Oct 2026) evaluated how much different production harnesses affect LLM performance on coding tasks. Key findings:

- **Cost varies up to 3x** across harnesses with the same model and tasks.
- **Run-to-run variation is 13%** — swapping harnesses flips as many tasks as rerunning the same harness.
- **Cost is driven by** the preamble of system prompts and tool schemas, scaled by the number of steps.
- **Performance differences are minimal** (within 5 points on 447 tasks) — cost, not correctness, is the main differentiator.

**Current gap:** Nemons' `RunOutputs` has `claimedOutcome`, `claimedSummary`, `artifactRefs`, `traceRef` — but NO cost, latency, token count, tool call count, model, or harness version metadata. Without these metrics:
- Paired baseline comparisons can't measure cost.
- Run-to-run variance can't be quantified.
- Reproducibility (pinned model, harness, version) can't be enforced.

## Decision

Add a **`RunMetrics`** interface to the Run schema, with optional fields for cost, latency, tokens, tool calls, model, harness version, and step count.

### RunMetrics Fields

| Field | Type | Description |
|-------|------|-------------|
| `tokenCount?` | number | Total tokens consumed (input + output) |
| `costUsd?` | number | Estimated monetary cost in USD |
| `latencyMs?` | number | Wall-clock execution time in milliseconds |
| `toolCallCount?` | number | Number of tool invocations |
| `stepCount?` | number | Number of harness steps (model calls + tool calls) |
| `modelId?` | string | Model identifier (e.g., "gpt-4o", "claude-3.5-sonnet") |
| `harnessVersion?` | string | Harness/adapter version (e.g., "local-exec-v1", "mock-v1") |

All fields are **optional** because:
- Not all adapters can report all metrics.
- The MockAdapter reports simulated values.
- The LocalExecutionAdapter reports real `latencyMs`, `toolCallCount`, `stepCount`, `harnessVersion` but not `tokenCount` or `costUsd` (no LLM).
- Future adapters (OpenHands, etc.) can report all fields.

### What This Does NOT Do

- Does NOT require all adapters to report all metrics.
- Does NOT modify the Run state machine.
- Does NOT change the Evaluation engine.
- Does NOT introduce cost-based policy decisions (deferred).
- Does NOT require network access or external pricing APIs.

### Paper Alignment

The paper's key insight: "cost is driven by the preamble of system prompts and tool schemas, scaled by the number of steps." Nemons' `stepCount` and `tokenCount` fields capture this directly. The `costUsd` field allows future cost-aware policy decisions (e.g., "reject Runs exceeding a cost threshold").

The paper's 13% run-to-run variation finding means: repeated Runs with the same configuration can produce different results. The `metrics` field enables measuring this variance by recording per-Run metrics across repeated executions.

## Rationale

1. **Research-backed**: the paper ran 5 models × 3 harnesses × 447 tasks with reruns.
2. **Enables Priority 1**: paired evaluation requires cost/latency measurement.
3. **Low risk**: additive, optional fields. Doesn't change existing behavior.
4. **Fits authorization**: within Stage C scope (ADR-0006). No external services.
5. **Clear acceptance criteria**: when metrics are provided, they're persisted and queryable.

## Compliance

- All existing tests continue to pass (the field is optional and additive).
- New tests verify the metrics behavior.
- The LocalExecutionAdapter captures REAL latency and tool-call counts.
- The MockAdapter reports SIMULATED metrics (for testing).
