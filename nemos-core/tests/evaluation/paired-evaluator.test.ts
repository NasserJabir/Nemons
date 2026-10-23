/**
 * Paired Baseline Evaluation tests (ADR-0013 — from VERA + "What Does a Harness Buy?").
 *
 * Verifies:
 *   PE1: same outcome (both succeeded) → outcomeComparison = "same".
 *   PE2: improved (baseline failed, candidate succeeded) → "improved".
 *   PE3: regressed (baseline succeeded, candidate failed) → "regressed".
 *   PE4: inconclusive (unknown/partial outcome) → "inconclusive".
 *   PE5: metric deltas are computed correctly.
 *   PE6: deltaPct is computed as (candidate - baseline) / baseline * 100.
 *   PE7: withinNoiseBand = true when all deltas < 13%.
 *   PE8: withinNoiseBand = false when any delta > 13%.
 *   PE9: default noise threshold is 13% (from the paper).
 *   PE10: custom noise threshold works.
 *   PE11: missing metrics on one Run → delta is undefined for those metrics.
 *   PE12: summary string is human-readable.
 *   PE13: no metrics on either Run → withinNoiseBand = true (vacuously).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultPairedEvaluator,
  DEFAULT_NOISE_THRESHOLD_PCT,
} from "../../src/evaluation/paired-evaluator.js";
import type { Run } from "../../src/schemas/run.js";
import type { RunMetrics } from "../../src/schemas/run.js";
import { asRunId, asContextPackId } from "../../src/core/identifiers.js";

function makeRun(
  overrides: Partial<Run> & { metrics?: RunMetrics; claimedOutcome?: Run["outputs"] extends { claimedOutcome: infer O } | undefined ? O : never } = {},
): Run {
  const claimedOutcome = overrides.claimedOutcome ?? "succeeded";
  return {
    id: asRunId("r-base"),
    state: claimedOutcome === "succeeded" ? "succeeded" : "failed",
    inputs: {
      taskDescription: "Fix test",
      taskKind: "test-fix",
      repoInstance: {
        repoIdentity: { repo: "x", sha: "y" },
        instanceId: "i",
      },
    },
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "x", at: "2024-01-01T00:00:00Z" },
    },
    outputs: {
      claimedOutcome,
      metrics: overrides.metrics,
    },
    evidenceRefs: ["ev-1"],
    ...overrides,
  };
}

describe("Paired Baseline Evaluation (ADR-0013 — VERA + What Does a Harness Buy?)", () => {
  let evaluator: DefaultPairedEvaluator;

  beforeEach(() => {
    evaluator = new DefaultPairedEvaluator();
  });

  describe("PE1 + PE2 + PE3 + PE4: outcome comparison", () => {
    it("PE1: both succeeded → same", () => {
      const baseline = makeRun({ id: asRunId("r-base"), claimedOutcome: "succeeded" });
      const candidate = makeRun({ id: asRunId("r-cand"), claimedOutcome: "succeeded" });
      const result = evaluator.compare(baseline, candidate);
      expect(result.outcomeComparison).toBe("same");
    });

    it("PE2: baseline failed, candidate succeeded → improved", () => {
      const baseline = makeRun({ id: asRunId("r-base"), claimedOutcome: "failed" });
      const candidate = makeRun({ id: asRunId("r-cand"), claimedOutcome: "succeeded" });
      const result = evaluator.compare(baseline, candidate);
      expect(result.outcomeComparison).toBe("improved");
    });

    it("PE3: baseline succeeded, candidate failed → regressed", () => {
      const baseline = makeRun({ id: asRunId("r-base"), claimedOutcome: "succeeded" });
      const candidate = makeRun({ id: asRunId("r-cand"), claimedOutcome: "failed" });
      const result = evaluator.compare(baseline, candidate);
      expect(result.outcomeComparison).toBe("regressed");
    });

    it("PE4: unknown outcome → inconclusive", () => {
      const baseline = makeRun({ id: asRunId("r-base"), claimedOutcome: "unknown" as never });
      const candidate = makeRun({ id: asRunId("r-cand"), claimedOutcome: "succeeded" });
      const result = evaluator.compare(baseline, candidate);
      expect(result.outcomeComparison).toBe("inconclusive");
    });

    it("both failed → same", () => {
      const baseline = makeRun({ id: asRunId("r-base"), claimedOutcome: "failed" });
      const candidate = makeRun({ id: asRunId("r-cand"), claimedOutcome: "failed" });
      const result = evaluator.compare(baseline, candidate);
      expect(result.outcomeComparison).toBe("same");
    });
  });

  describe("PE5 + PE6: metric deltas", () => {
    it("PE5: deltas are computed correctly", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 1000, toolCallCount: 5, stepCount: 3, harnessVersion: "v1" },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 1200, toolCallCount: 5, stepCount: 4, harnessVersion: "v2" },
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.metricDeltas.latencyMs?.baseline).toBe(1000);
      expect(result.metricDeltas.latencyMs?.candidate).toBe(1200);
      expect(result.metricDeltas.latencyMs?.delta).toBe(200);
      expect(result.metricDeltas.toolCallCount?.delta).toBe(0);
      expect(result.metricDeltas.stepCount?.delta).toBe(1);
    });

    it("PE6: deltaPct = (candidate - baseline) / baseline * 100", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 1000 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 1200 },
      });
      const result = evaluator.compare(baseline, candidate);
      // (1200 - 1000) / 1000 * 100 = 20%
      expect(result.metricDeltas.latencyMs?.deltaPct).toBe(20);
    });
  });

  describe("PE7 + PE8 + PE9 + PE10: noise band detection", () => {
    it("PE7: withinNoiseBand = true when all deltas < 13%", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 1000, toolCallCount: 10 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 1050, toolCallCount: 11 }, // 5% and 10% — both < 13%
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.withinNoiseBand).toBe(true);
    });

    it("PE8: withinNoiseBand = false when any delta > 13%", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 1000, toolCallCount: 10 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 1200, toolCallCount: 11 }, // 20% and 10% — 20% > 13%
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.withinNoiseBand).toBe(false);
    });

    it("PE9: default noise threshold is 13%", () => {
      expect(DEFAULT_NOISE_THRESHOLD_PCT).toBe(13);
      const baseline = makeRun({ id: asRunId("r-base"), metrics: { latencyMs: 1000 } });
      const candidate = makeRun({ id: asRunId("r-cand"), metrics: { latencyMs: 1000 } });
      const result = evaluator.compare(baseline, candidate);
      expect(result.noiseThresholdPct).toBe(13);
    });

    it("PE10: custom noise threshold works", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 1000 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 1050 }, // 5% delta
      });
      // With a 3% threshold, 5% exceeds it
      const result = evaluator.compare(baseline, candidate, 3);
      expect(result.noiseThresholdPct).toBe(3);
      expect(result.withinNoiseBand).toBe(false);
      // With a 10% threshold, 5% is within it
      const result2 = evaluator.compare(baseline, candidate, 10);
      expect(result2.withinNoiseBand).toBe(true);
    });
  });

  describe("PE11 + PE13: missing metrics", () => {
    it("PE11: missing metrics on one Run → delta is undefined", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 1000 }, // no toolCallCount
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 1200, toolCallCount: 5 },
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.metricDeltas.latencyMs?.delta).toBe(200);
      expect(result.metricDeltas.toolCallCount?.delta).toBeUndefined();
    });

    it("PE13: no metrics on either Run → withinNoiseBand = true", () => {
      const baseline = makeRun({ id: asRunId("r-base") });
      const candidate = makeRun({ id: asRunId("r-cand") });
      const result = evaluator.compare(baseline, candidate);
      expect(result.withinNoiseBand).toBe(true);
    });
  });

  describe("PE12: summary string", () => {
    it("is human-readable and includes key information", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        claimedOutcome: "failed",
        metrics: { latencyMs: 1000, toolCallCount: 5 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        claimedOutcome: "succeeded",
        metrics: { latencyMs: 1200, toolCallCount: 6 },
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.summary).toContain("r-base");
      expect(result.summary).toContain("r-cand");
      expect(result.summary).toContain("improved");
      expect(result.summary).toContain("latencyMs");
      expect(result.summary).toContain("1000");
      expect(result.summary).toContain("1200");
      expect(result.summary).toContain("noise band");
    });
  });

  describe("PE14: cost comparison", () => {
    it("compares costUsd when both Runs report it", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { costUsd: 0.50 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { costUsd: 0.75 }, // 50% increase
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.metricDeltas.costUsd?.delta).toBe(0.25);
      expect(result.metricDeltas.costUsd?.deltaPct).toBe(50);
      expect(result.withinNoiseBand).toBe(false); // 50% > 13%
    });
  });

  describe("PE15: real-world scenario — 13% noise band", () => {
    it("a 12% latency increase is within the noise band", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 10000 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 11200 }, // 12% increase
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.withinNoiseBand).toBe(true); // 12% < 13%
    });

    it("a 14% latency increase is OUTSIDE the noise band", () => {
      const baseline = makeRun({
        id: asRunId("r-base"),
        metrics: { latencyMs: 10000 },
      });
      const candidate = makeRun({
        id: asRunId("r-cand"),
        metrics: { latencyMs: 11400 }, // 14% increase
      });
      const result = evaluator.compare(baseline, candidate);
      expect(result.withinNoiseBand).toBe(false); // 14% > 13%
    });
  });
});
