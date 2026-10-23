import { describe, it, expect, beforeEach } from "vitest";
import { DefaultEvaluationEngine } from "../../src/evaluation/evaluation-engine.js";
import { DefaultEvidenceCollector } from "../../src/evidence/evidence-collector.js";
import { DefaultEvidenceValidator } from "../../src/evidence/evidence-validator.js";
import type { Run, RunInputs } from "../../src/schemas/run.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { EvaluationCriterion } from "../../src/schemas/evaluation.js";
import { asRunId, asContextPackId } from "../../src/core/identifiers.js";

function makeRunInputs(): RunInputs {
  return {
    taskDescription: "Fix the failing test",
    taskKind: "test-fix",
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc" },
      instanceId: "inst-1",
    },
  };
}

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: asRunId("r-1"),
    state: "in_progress",
    inputs: makeRunInputs(),
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "x" },
    },
    ...overrides,
  };
}

describe("evaluation-engine", () => {
  let engine: DefaultEvaluationEngine;
  let collector: DefaultEvidenceCollector;
  let validator: DefaultEvidenceValidator;

  beforeEach(() => {
    engine = new DefaultEvaluationEngine();
    collector = new DefaultEvidenceCollector();
    validator = new DefaultEvidenceValidator();
  });

  function makeCriteria(): EvaluationCriterion[] {
    return [
      {
        id: "tests-pass",
        description: "All tests pass",
        requiredEvidenceKinds: ["test_result"],
        required: true,
      },
      {
        id: "build-succeeds",
        description: "Build succeeds",
        requiredEvidenceKinds: ["build_output"],
        required: true,
      },
    ];
  }

  it("returns verified_succeeded when ALL required criteria are met", () => {
    const testEvidence = validator.verify(
      collector.fromVerificationResult(asRunId("r-1"), {
        kind: "test_result",
        claim: "tests pass",
        payload: '{"passed":true}',
      }),
    );
    const buildEvidence = validator.verify(
      collector.fromVerificationResult(asRunId("r-1"), {
        kind: "build_output",
        claim: "build ok",
        payload: '{"ok":true}',
      }),
    );
    const evaluation = engine.evaluate({
      run: makeRun({
        outputs: { claimedOutcome: "succeeded", claimedSummary: "done" },
      }),
      criteria: makeCriteria(),
      evidence: [testEvidence, buildEvidence],
      evaluator: "default",
    });
    expect(evaluation.overallResult).toBe("verified_succeeded");
    expect(evaluation.results).toHaveLength(2);
    expect(evaluation.results[0]?.satisfied).toBe(true);
    expect(evaluation.results[1]?.satisfied).toBe(true);
  });

  it("returns claimed_succeeded_unverified when criteria are NOT all met but run claimed success", () => {
    // Only test evidence, no build evidence
    const testEvidence = validator.verify(
      collector.fromVerificationResult(asRunId("r-1"), {
        kind: "test_result",
        claim: "tests pass",
        payload: '{"passed":true}',
      }),
    );
    const evaluation = engine.evaluate({
      run: makeRun({
        outputs: { claimedOutcome: "succeeded" },
      }),
      criteria: makeCriteria(),
      evidence: [testEvidence],
      evaluator: "default",
    });
    expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
    expect(evaluation.results[0]?.satisfied).toBe(true);
    expect(evaluation.results[1]?.satisfied).toBe(false);
  });

  it("returns failed when the run claimed failure", () => {
    const evaluation = engine.evaluate({
      run: makeRun({
        outputs: { claimedOutcome: "failed" },
      }),
      criteria: makeCriteria(),
      evidence: [],
      evaluator: "default",
    });
    expect(evaluation.overallResult).toBe("failed");
  });

  it("returns inconclusive when no claim and criteria not met", () => {
    const evaluation = engine.evaluate({
      run: makeRun({ outputs: undefined }),
      criteria: makeCriteria(),
      evidence: [],
      evaluator: "default",
    });
    expect(evaluation.overallResult).toBe("inconclusive");
  });

  it("does NOT count unverified evidence toward criterion satisfaction", () => {
    // Build an evidence record that is NOT verified
    const unverifiedEvidence: Evidence = {
      id: "ev-1" as never,
      runId: asRunId("r-1"),
      kind: "test_result",
      claim: "tests pass",
      artifact: { inlinePayload: "x", contentHash: "x" },
      provenance: {
        kind: "observed",
        source: { kind: "run", runId: asRunId("r-1"), at: "x" },
      },
      recordedAt: "x",
      verified: false,
    };
    const evaluation = engine.evaluate({
      run: makeRun({ outputs: { claimedOutcome: "succeeded" } }),
      criteria: [
        {
          id: "tests-pass",
          description: "tests pass",
          requiredEvidenceKinds: ["test_result"],
          required: true,
        },
      ],
      evidence: [unverifiedEvidence],
      evaluator: "default",
    });
    // Unverified evidence doesn't count → claimed_succeeded_unverified
    expect(evaluation.overallResult).toBe("claimed_succeeded_unverified");
    expect(evaluation.results[0]?.satisfied).toBe(false);
  });

  it("records limitations when no evidence is provided", () => {
    const evaluation = engine.evaluate({
      run: makeRun(),
      criteria: makeCriteria(),
      evidence: [],
      evaluator: "default",
    });
    expect(evaluation.limitations).toBeDefined();
    expect(evaluation.limitations?.some((l) => l.includes("No Evidence"))).toBe(true);
  });

  it("records limitations when no criteria are defined", () => {
    const evaluation = engine.evaluate({
      run: makeRun(),
      criteria: [],
      evidence: [],
      evaluator: "default",
    });
    expect(evaluation.limitations?.some((l) => l.includes("No criteria"))).toBe(true);
  });
});
