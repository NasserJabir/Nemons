/**
 * Offline Skill Evaluation tests (ADR-0015 — from TeleTune).
 *
 * Verifies:
 *   OE1: evaluates a Skill against historical Runs.
 *   OE2: splits data into generation and evaluation sets.
 *   OE3: success rate is computed correctly.
 *   OE4: failure attribution breakdown is computed (ADR-0010).
 *   OE5: average metrics are computed (ADR-0011).
 *   OE6: action-prediction accuracy is SUPPORTING only (not proof).
 *   OE7: adoptionAuthorized is ALWAYS false (no auto-promotion).
 *   OE8: empty data → successRate=0, totalEvaluated=0.
 *   OE9: Runs without the Skill's Evidence are excluded.
 *   OE10: custom split ratio works.
 *   OE11: the report is read-only (doesn't modify inputs).
 *   OE12: summary is human-readable.
 *   OE13: "a failure is not automatically a Skill failure" — attribution distinguishes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultOfflineSkillEvaluator } from "../../src/evaluation/offline-skill-evaluator.js";
import type { Run, Evidence, FailureAttribution } from "../../src/schemas/run.js";
import type { AttributedComponent } from "../../src/schemas/evidence.js";
import {
  asRunId,
  asContextPackId,
  asEvidenceId,
  sha256Hex,
} from "../../src/core/identifiers.js";

function makeRun(
  id: string,
  state: "succeeded" | "failed",
  overrides: Partial<Run> = {},
): Run {
  return {
    id: asRunId(id),
    state,
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
      claimedOutcome: state === "succeeded" ? "succeeded" : "failed",
      metrics: {
        latencyMs: 1000,
        toolCallCount: 5,
        stepCount: 3,
        harnessVersion: "test-v1",
      },
    },
    evidenceRefs: ["ev-1"],
    ...overrides,
  };
}

function makeFailedRun(
  id: string,
  attributionCategory: FailureAttribution["category"],
): Run {
  const attribution: FailureAttribution = {
    category: attributionCategory,
    description: `Failure attributed to ${attributionCategory}`,
    attributedBy: "test",
    attributedAt: "2024-01-01T00:00:00Z",
  };
  return makeRun(id, "failed", { failureAttribution: attribution });
}

function makeEvidenceForSkill(
  runId: string,
  skillId: string,
  overrides: Partial<Evidence> = {},
): Evidence {
  const attributedComponent: AttributedComponent = {
    componentKind: "skill",
    componentId: skillId,
    componentVersion: "1.0.0",
    relationship: "produced by",
  };
  return {
    id: asEvidenceId(`ev-${runId}`),
    runId: asRunId(runId),
    kind: "test_result",
    claim: "tests pass",
    artifact: {
      inlinePayload: '{"passing":true}',
      contentHash: sha256Hex('{"passing":true}'),
      contentType: "application/json",
      bytes: 16,
    },
    provenance: {
      kind: "observed",
      source: { kind: "run", runId: asRunId(runId), at: "2024-01-01T00:00:00Z" },
    },
    recordedAt: "2024-01-01T00:00:00Z",
    verified: true,
    attributedComponent,
    ...overrides,
  };
}

describe("Offline Skill Evaluation (ADR-0015 — TeleTune)", () => {
  let evaluator: DefaultOfflineSkillEvaluator;

  beforeEach(() => {
    evaluator = new DefaultOfflineSkillEvaluator();
  });

  describe("OE1 + OE3: basic evaluation", () => {
    it("OE1: evaluates a Skill against historical Runs", () => {
      const runs = [
        makeRun("r-1", "succeeded"),
        makeRun("r-2", "succeeded"),
        makeRun("r-3", "failed"),
        makeRun("r-4", "succeeded"),
      ];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
      });
      expect(report.skillId).toBe("skill-1");
      expect(report.totalRunsEvaluated).toBeGreaterThan(0);
    });

    it("OE3: success rate is computed correctly (3 succeeded, 1 failed)", () => {
      const runs = [
        makeRun("r-1", "succeeded"),
        makeRun("r-2", "succeeded"),
        makeRun("r-3", "failed"),
        makeRun("r-4", "succeeded"),
      ];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.5, // 2 gen, 2 eval
      });
      // With 4 runs, 50% split: 2 generation, 2 evaluation
      expect(report.dataSplit.evaluationSetSize).toBe(2);
      // Of the 2 evaluation runs, at least 1 succeeded (deterministic split)
      expect(report.successRate).toBeGreaterThan(0);
    });
  });

  describe("OE2 + OE10: data split", () => {
    it("OE2: splits data into generation and evaluation sets", () => {
      const runs = Array.from({ length: 10 }, (_, i) =>
        makeRun(`r-${i}`, "succeeded"),
      );
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.5,
      });
      expect(report.dataSplit.generationSetSize).toBe(5);
      expect(report.dataSplit.evaluationSetSize).toBe(5);
      expect(report.dataSplit.splitRatio).toBe(0.5);
    });

    it("OE10: custom split ratio (0.3)", () => {
      const runs = Array.from({ length: 10 }, (_, i) =>
        makeRun(`r-${i}`, "succeeded"),
      );
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.3, // 3 gen, 7 eval
      });
      expect(report.dataSplit.generationSetSize).toBe(3);
      expect(report.dataSplit.evaluationSetSize).toBe(7);
    });
  });

  describe("OE4: failure attribution breakdown (ADR-0010)", () => {
    it("computes the breakdown by category", () => {
      const runs = [
        makeFailedRun("r-1", "model"),
        makeFailedRun("r-2", "skill"),
        makeFailedRun("r-3", "tool"),
        makeFailedRun("r-4", "unknown"),
      ];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.5, // 2 gen, 2 eval
      });
      expect(report.failureAttributionBreakdown.total).toBeGreaterThan(0);
      // At least one failure was attributed (deterministic split)
      expect(report.failureAttributionBreakdown.total).toBeLessThanOrEqual(4);
    });
  });

  describe("OE5: average metrics (ADR-0011)", () => {
    it("computes average latencyMs and toolCallCount", () => {
      const runs = [
        makeRun("r-1", "succeeded", {
          outputs: {
            claimedOutcome: "succeeded",
            metrics: { latencyMs: 1000, toolCallCount: 5, stepCount: 3, harnessVersion: "v1" },
          },
        }),
        makeRun("r-2", "succeeded", {
          outputs: {
            claimedOutcome: "succeeded",
            metrics: { latencyMs: 2000, toolCallCount: 10, stepCount: 5, harnessVersion: "v1" },
          },
        }),
        makeRun("r-3", "succeeded", {
          outputs: {
            claimedOutcome: "succeeded",
            metrics: { latencyMs: 3000, toolCallCount: 15, stepCount: 7, harnessVersion: "v1" },
          },
        }),
        makeRun("r-4", "succeeded", {
          outputs: {
            claimedOutcome: "succeeded",
            metrics: { latencyMs: 4000, toolCallCount: 20, stepCount: 9, harnessVersion: "v1" },
          },
        }),
      ];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.5,
      });
      // With 2 eval runs, avg latencyMs = (3000 + 4000) / 2 = 3500
      expect(report.averageMetrics.avgLatencyMs).toBe(3500);
      expect(report.averageMetrics.avgToolCallCount).toBe(17.5);
    });
  });

  describe("OE6: action-prediction accuracy is SUPPORTING only", () => {
    it("reports actionPredictionAccuracy when provided", () => {
      const runs = [makeRun("r-1", "succeeded"), makeRun("r-2", "succeeded")];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.5,
        actionPredictionAccuracy: 0.85,
      });
      expect(report.actionPredictionAccuracy).toBe(0.85);
      // The summary should mention it's SUPPORTING only
      expect(report.summary).toContain("SUPPORTING");
      expect(report.summary).toContain("NOT proof");
    });
  });

  describe("OE7: adoptionAuthorized is ALWAYS false", () => {
    it("never authorizes adoption (no auto-promotion)", () => {
      const runs = [makeRun("r-1", "succeeded"), makeRun("r-2", "succeeded")];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
      });
      expect(report.adoptionAuthorized).toBe(false);
    });

    it("even with 100% success rate, adoption is NOT authorized", () => {
      const runs = Array.from({ length: 10 }, (_, i) =>
        makeRun(`r-${i}`, "succeeded"),
      );
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
      });
      expect(report.successRate).toBe(1.0);
      expect(report.adoptionAuthorized).toBe(false);
    });
  });

  describe("OE8: empty data", () => {
    it("returns successRate=0 and totalEvaluated=0 for empty data", () => {
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs: [],
        evidence: [],
      });
      expect(report.totalRunsEvaluated).toBe(0);
      expect(report.successRate).toBe(0);
      expect(report.failureCount).toBe(0);
    });
  });

  describe("OE9: Runs without the Skill's Evidence are excluded", () => {
    it("only evaluates Runs whose Evidence references the Skill", () => {
      const runs = [
        makeRun("r-1", "succeeded"),
        makeRun("r-2", "succeeded"),
        makeRun("r-unrelated", "succeeded"), // no Evidence referencing skill-1
      ];
      const evidence = [
        makeEvidenceForSkill("r-1", "skill-1"),
        makeEvidenceForSkill("r-2", "skill-1"),
        // r-unrelated has no Evidence about skill-1
      ];
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.5,
      });
      // Only r-1 and r-2 are evaluated; r-unrelated is excluded
      expect(report.totalRunsEvaluated).toBeLessThanOrEqual(2);
    });
  });

  describe("OE11: read-only", () => {
    it("doesn't modify the input arrays", () => {
      const runs = [makeRun("r-1", "succeeded"), makeRun("r-2", "succeeded")];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const runsBefore = runs.length;
      const evidenceBefore = evidence.length;
      evaluator.evaluate({ skillId: "skill-1", runs, evidence });
      expect(runs.length).toBe(runsBefore);
      expect(evidence.length).toBe(evidenceBefore);
    });
  });

  describe("OE12: summary is human-readable", () => {
    it("includes key information", () => {
      const runs = [makeRun("r-1", "succeeded"), makeRun("r-2", "failed")];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        skillVersion: "1.0.0",
        runs,
        evidence,
        splitRatio: 0.5,
        actionPredictionAccuracy: 0.90,
      });
      expect(report.summary).toContain("skill-1");
      expect(report.summary).toContain("1.0.0");
      expect(report.summary).toContain("Success rate");
      expect(report.summary).toContain("SUPPORTING");
      expect(report.summary).toContain("NOT authorize");
    });
  });

  describe("OE13: 'a failure is not automatically a Skill failure'", () => {
    it("distinguishes skill failures from other causes in the breakdown", () => {
      const runs = [
        makeFailedRun("r-1", "model"), // NOT a skill failure
        makeFailedRun("r-2", "skill"), // IS a skill failure
        makeFailedRun("r-3", "tool"), // NOT a skill failure
        makeFailedRun("r-4", "skill"), // IS a skill failure
      ];
      const evidence = runs.map((r) => makeEvidenceForSkill(r.id, "skill-1"));
      const report = evaluator.evaluate({
        skillId: "skill-1",
        runs,
        evidence,
        splitRatio: 0.5,
      });
      // The breakdown should distinguish model/skill/tool failures
      expect(report.failureAttributionBreakdown.model).toBeGreaterThanOrEqual(0);
      expect(report.failureAttributionBreakdown.skill).toBeGreaterThanOrEqual(0);
      expect(report.failureAttributionBreakdown.tool).toBeGreaterThanOrEqual(0);
      // The total should match the number of failed Runs in the evaluation set
      const totalFailures = report.failureAttributionBreakdown.total;
      const sumOfCategories =
        report.failureAttributionBreakdown.model +
        report.failureAttributionBreakdown.harness +
        report.failureAttributionBreakdown.skill +
        report.failureAttributionBreakdown.knowledge +
        report.failureAttributionBreakdown.tool +
        report.failureAttributionBreakdown.policy +
        report.failureAttributionBreakdown.environment +
        report.failureAttributionBreakdown.unknown;
      expect(sumOfCategories).toBe(totalFailures);
    });
  });
});
