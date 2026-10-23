/**
 * Tests for F-053 (Verification Loop), F-055 (Stop Conditions),
 * F-002 (Acceptance Criteria), and F-059 (Developer Interface).
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_STOP_CONDITIONS,
  checkStopConditions,
  DefaultVerificationLoopController,
  type LoopControllerCallbacks,
} from "../../src/run/verification-loop-controller.js";
import type { Run, RunInputs, RunOutputs } from "../../src/schemas/run.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import type { Evaluation } from "../../src/schemas/evaluation.js";
import type { ContextPack } from "../../src/schemas/context-pack.js";
import { DefaultDeveloperInterface } from "../../src/developer-interface.js";
import { validateRun } from "../../src/schemas/run.js";
import {
  asRunId,
  asContextPackId,
  asEvidenceId,
  asEvaluationId,
  asExperienceId,
  asCandidateId,
  asPersonaId,
  asSkillId,
  sha256Hex,
} from "../../src/core/identifiers.js";

function makeRunInputs(overrides: Partial<RunInputs> = {}): RunInputs {
  return {
    taskDescription: "Fix the failing test",
    taskKind: "test-fix",
    repoInstance: {
      repoIdentity: { repo: "x", sha: "y" },
      instanceId: "i",
    },
    acceptanceCriteria: ["all tests pass", "the build succeeds"],
    ...overrides,
  };
}

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: asRunId("r-1"),
    state: "in_progress",
    inputs: makeRunInputs(),
    contextPackId: asContextPackId("cp-1"),
    provenance: { kind: "observed", source: { kind: "human", actor: "x", at: "x" } },
    outputs: { claimedOutcome: "succeeded" },
    evidenceRefs: ["ev-1"],
    ...overrides,
  };
}

function makeEvaluation(result: Evaluation["overallResult"]): Evaluation {
  return {
    id: asEvaluationId("eval-1"),
    runId: asRunId("r-1"),
    criteria: [{ id: "c-1", description: "x", requiredEvidenceKinds: ["test_result"], required: true }],
    results: [{ criterionId: "c-1", satisfied: result === "verified_succeeded", examinedEvidenceRefs: ["ev-1"], reason: "x" }],
    overallResult: result,
    provenance: { kind: "observed", source: { kind: "run", runId: asRunId("r-1"), at: "x" } },
    evaluatedAt: "x",
    evaluator: "test",
  };
}

describe("F-053/F-055: Verification Loop + Stop Conditions", () => {
  describe("checkStopConditions", () => {
    it("stops on verified_succeeded", () => {
      const run = makeRun({ state: "in_progress" });
      const eval_ = makeEvaluation("verified_succeeded");
      const decision = checkStopConditions(eval_, run, 0, DEFAULT_STOP_CONDITIONS);
      expect(decision.kind).toBe("stop");
      if (decision.kind === "stop") {
        expect(decision.finalOutcome).toBe("succeeded");
      }
    });

    it("retries when not succeeded and retries remaining", () => {
      const run = makeRun({ state: "in_progress" });
      const eval_ = makeEvaluation("claimed_succeeded_unverified");
      const decision = checkStopConditions(eval_, run, 0, DEFAULT_STOP_CONDITIONS);
      expect(decision.kind).toBe("retry");
      if (decision.kind === "retry") {
        expect(decision.retryCount).toBe(1);
      }
    });

    it("stops when max retries reached", () => {
      const run = makeRun({ state: "in_progress" });
      const eval_ = makeEvaluation("failed");
      const decision = checkStopConditions(eval_, run, 3, DEFAULT_STOP_CONDITIONS);
      expect(decision.kind).toBe("stop");
      if (decision.kind === "stop") {
        expect(decision.finalOutcome).toBe("failed");
        expect(decision.reason).toContain("Maximum retries");
      }
    });

    it("stops on unrecoverable failure (environment)", () => {
      const run = makeRun({
        state: "failed",
        failureAttribution: {
          category: "environment",
          description: "filesystem full",
          attributedBy: "system",
          attributedAt: "x",
        },
      });
      const eval_ = makeEvaluation("failed");
      const decision = checkStopConditions(eval_, run, 0, DEFAULT_STOP_CONDITIONS);
      expect(decision.kind).toBe("stop");
      if (decision.kind === "stop") {
        expect(decision.reason).toContain("environment");
      }
    });

    it("stops on unrecoverable failure (unknown)", () => {
      const run = makeRun({
        state: "failed",
        failureAttribution: {
          category: "unknown",
          description: "cause unknown",
          attributedBy: "system",
          attributedAt: "x",
        },
      });
      const eval_ = makeEvaluation("failed");
      const decision = checkStopConditions(eval_, run, 0, DEFAULT_STOP_CONDITIONS);
      expect(decision.kind).toBe("stop");
    });

    it("retries on model failure (recoverable)", () => {
      const run = makeRun({
        state: "failed",
        failureAttribution: {
          category: "model",
          description: "model error",
          attributedBy: "system",
          attributedAt: "x",
        },
      });
      const eval_ = makeEvaluation("failed");
      const decision = checkStopConditions(eval_, run, 0, DEFAULT_STOP_CONDITIONS);
      expect(decision.kind).toBe("retry");
    });

    it("stops when cost budget exceeded", () => {
      const run = makeRun({ state: "in_progress" });
      const eval_ = makeEvaluation("failed");
      const decision = checkStopConditions(eval_, run, 0, {
        ...DEFAULT_STOP_CONDITIONS,
        maxCostUsd: 1.00,
      }, 1.50, 0);
      expect(decision.kind).toBe("stop");
      if (decision.kind === "stop") {
        expect(decision.finalOutcome).toBe("aborted");
        expect(decision.reason).toContain("Cost budget");
      }
    });

    it("stops when latency budget exceeded", () => {
      const run = makeRun({ state: "in_progress" });
      const eval_ = makeEvaluation("failed");
      const decision = checkStopConditions(eval_, run, 0, {
        ...DEFAULT_STOP_CONDITIONS,
        maxTotalLatencyMs: 5000,
      }, 0, 6000);
      expect(decision.kind).toBe("stop");
      if (decision.kind === "stop") {
        expect(decision.reason).toContain("Latency");
      }
    });
  });

  describe("DefaultVerificationLoopController", () => {
    it("executes a loop that succeeds on first attempt", async () => {
      const callbacks: LoopControllerCallbacks = {
        createRun: (inputs, cpId) => makeRun({ id: asRunId("r-1"), inputs, contextPackId: cpId }),
        startRun: (id) => makeRun({ id, state: "in_progress" }),
        invokeAdapter: async () => ({ claimedOutcome: "succeeded" }),
        collectEvidence: () => [],
        evaluateRun: () => makeEvaluation("verified_succeeded"),
        markSucceeded: (id) => makeRun({ id, state: "succeeded" }),
        markFailed: (id, reason) => makeRun({ id, state: "failed" }),
        getContextPack: () => ({ id: asContextPackId("cp-1"), runId: asRunId("r-1"), assets: [], exclusions: [], constraints: { maxAssets: 10, maxContentBytes: 10000 }, actualBytes: 0, createdAt: "x" }),
      };
      const controller = new DefaultVerificationLoopController(callbacks);
      const result = await controller.executeLoop({
        runInputs: makeRunInputs(),
        initialContextPackId: asContextPackId("cp-1"),
      });
      expect(result.finalOutcome).toBe("succeeded");
      expect(result.totalRuns).toBe(1);
      expect(result.retryCount).toBe(0);
    });

    it("retries on failure then succeeds", async () => {
      let attempt = 0;
      const callbacks: LoopControllerCallbacks = {
        createRun: (inputs, cpId) => makeRun({ id: asRunId(`r-${attempt}`), inputs, contextPackId: cpId }),
        startRun: (id) => makeRun({ id, state: "in_progress" }),
        invokeAdapter: async () => {
          attempt++;
          return { claimedOutcome: attempt >= 2 ? "succeeded" : "failed" };
        },
        collectEvidence: () => [],
        evaluateRun: () => makeEvaluation(attempt >= 2 ? "verified_succeeded" : "failed"),
        markSucceeded: (id) => makeRun({ id, state: "succeeded" }),
        markFailed: (id) => makeRun({ id, state: "failed" }),
        getContextPack: () => ({ id: asContextPackId("cp-1"), runId: asRunId("r-1"), assets: [], exclusions: [], constraints: { maxAssets: 10, maxContentBytes: 10000 }, actualBytes: 0, createdAt: "x" }),
      };
      const controller = new DefaultVerificationLoopController(callbacks);
      const result = await controller.executeLoop({
        runInputs: makeRunInputs(),
        initialContextPackId: asContextPackId("cp-1"),
        stopConditions: { ...DEFAULT_STOP_CONDITIONS, maxRetries: 5 },
      });
      expect(result.finalOutcome).toBe("succeeded");
      expect(result.totalRuns).toBe(2);
      expect(result.retryCount).toBe(1);
    });

    it("stops after max retries", async () => {
      const callbacks: LoopControllerCallbacks = {
        createRun: (inputs, cpId) => makeRun({ id: asRunId(`r-${Date.now()}`), inputs, contextPackId: cpId }),
        startRun: (id) => makeRun({ id, state: "in_progress" }),
        invokeAdapter: async () => ({ claimedOutcome: "failed" }),
        collectEvidence: () => [],
        evaluateRun: () => makeEvaluation("failed"),
        markSucceeded: (id) => makeRun({ id, state: "succeeded" }),
        markFailed: (id) => makeRun({ id, state: "failed" }),
        getContextPack: () => ({ id: asContextPackId("cp-1"), runId: asRunId("r-1"), assets: [], exclusions: [], constraints: { maxAssets: 10, maxContentBytes: 10000 }, actualBytes: 0, createdAt: "x" }),
      };
      const controller = new DefaultVerificationLoopController(callbacks);
      const result = await controller.executeLoop({
        runInputs: makeRunInputs(),
        initialContextPackId: asContextPackId("cp-1"),
        stopConditions: { ...DEFAULT_STOP_CONDITIONS, maxRetries: 2 },
      });
      expect(result.finalOutcome).toBe("failed");
      expect(result.totalRuns).toBe(3); // initial + 2 retries
    });
  });
});

describe("F-002: Acceptance Criteria in Run inputs", () => {
  it("RunInputs has optional acceptanceCriteria field", () => {
    const inputs: RunInputs = {
      taskDescription: "Fix test",
      taskKind: "test-fix",
      repoInstance: {
        repoIdentity: { repo: "x", sha: "y" },
        instanceId: "i",
      },
      acceptanceCriteria: ["all tests pass", "build succeeds"],
    };
    expect(inputs.acceptanceCriteria).toEqual(["all tests pass", "build succeeds"]);
  });

  it("RunInputs without acceptanceCriteria is valid", () => {
    const inputs: RunInputs = {
      taskDescription: "Fix test",
      taskKind: "test-fix",
      repoInstance: {
        repoIdentity: { repo: "x", sha: "y" },
        instanceId: "i",
      },
    };
    expect(inputs.acceptanceCriteria).toBeUndefined();
  });

  it("validateRun accepts acceptanceCriteria", () => {
    const run = {
      id: "r-1",
      state: "pending",
      inputs: {
        taskDescription: "Fix test",
        taskKind: "test-fix",
        repoInstance: { repoIdentity: { repo: "x", sha: "y" }, instanceId: "i" },
        acceptanceCriteria: ["all tests pass"],
      },
      contextPackId: "cp-1",
      provenance: { kind: "observed", source: { kind: "human", actor: "x", at: "x" } },
    };
    // validateRun should not throw — acceptanceCriteria is optional and additive
    expect(() => validateRun(run)).not.toThrow();
  });
});

describe("F-059: Developer Interface", () => {
  it("listRuns returns all runs with state and outcome", () => {
    const runs = [makeRun({ id: asRunId("r-1"), state: "succeeded" }), makeRun({ id: asRunId("r-2"), state: "failed" })];
    const dev = new DefaultDeveloperInterface({ runs });
    const list = dev.listRuns();
    expect(list).toHaveLength(2);
    expect(list[0]!.state).toBe("succeeded");
    expect(list[1]!.state).toBe("failed");
  });

  it("inspectRun returns details for a found Run", () => {
    const run = makeRun({ id: asRunId("r-inspect"), state: "succeeded" });
    const dev = new DefaultDeveloperInterface({ runs: [run] });
    const result = dev.inspectRun("r-inspect");
    expect(result.run).toBeDefined();
    expect(result.summary).toContain("r-inspect");
    expect(result.summary).toContain("succeeded");
  });

  it("inspectRun returns not-found summary for unknown Run", () => {
    const dev = new DefaultDeveloperInterface({ runs: [] });
    const result = dev.inspectRun("nonexistent");
    expect(result.run).toBeUndefined();
    expect(result.summary).toContain("not found");
  });

  it("listExperiences returns provenance + reusability", () => {
    const exp = {
      id: asExperienceId("x-1"),
      runId: asRunId("r-1"),
      evaluationId: asEvaluationId("ev-1"),
      provenance: { kind: "approved" as const, source: { kind: "evidence" as const, evidenceId: asExperienceId("x") as never, at: "x" } },
      applicability: { taskKinds: ["test-fix"] },
      reusability: "reusable" as const,
      summary: "Rebuild before tests.",
      learnedAt: "x",
    };
    const dev = new DefaultDeveloperInterface({ experiences: [exp] });
    const list = dev.listExperiences();
    expect(list).toHaveLength(1);
    expect(list[0]!.provenanceKind).toBe("approved");
    expect(list[0]!.reusability).toBe("reusable");
  });

  it("listCandidates returns status + asset", () => {
    const cand = {
      id: asCandidateId("c-1"),
      assetKind: "skill" as const,
      assetId: "skill-1",
      proposedVersion: "1.0.0",
      changeKind: "create" as const,
      content: {},
      provenance: { kind: "observed" as const, source: { kind: "human" as const, actor: "x", at: "x" } },
      status: "approved" as const,
      proposedBy: "x",
      proposedAt: "x",
      rationale: "x",
      reviewTrail: [],
    };
    const dev = new DefaultDeveloperInterface({ candidates: [cand] });
    const list = dev.listCandidates();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("approved");
  });

  it("healthCheck returns summary", () => {
    const dev = new DefaultDeveloperInterface({});
    const result = dev.healthCheck();
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("summarizeEntity returns found summary for existing Run", () => {
    const run = makeRun({ id: asRunId("r-sum") });
    const dev = new DefaultDeveloperInterface({ runs: [run] });
    const result = dev.summarizeEntity("run", "r-sum");
    expect(result.found).toBe(true);
  });

  it("summarizeEntity returns not-found for missing Run", () => {
    const dev = new DefaultDeveloperInterface({});
    const result = dev.summarizeEntity("run", "nonexistent");
    expect(result.found).toBe(false);
  });
});
