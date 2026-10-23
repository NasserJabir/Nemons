import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import {
  isPolicyDeniedError,
  isInsufficientEvidenceError,
  isRunStateError,
} from "../../src/core/errors.js";
import type { RunInputs } from "../../src/schemas/run.js";
import { asContextPackId, asRunId } from "../../src/core/identifiers.js";
import type { Provenance } from "../../src/core/provenance.js";

function makeRunInputs(taskDescription = "Fix the failing test"): RunInputs {
  return {
    taskDescription,
    taskKind: "test-fix",
    taskTags: ["vitest"],
    repoInstance: {
      repoIdentity: { repo: "https://example.com/repo.git", sha: "abc123" },
      instanceId: "inst-1",
    },
  };
}

function makeProvenance(): Provenance {
  return {
    kind: "observed",
    source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
  };
}

describe("run-manager", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let engine: DefaultPolicyEngine;
  let manager: InMemoryRunManager;

  // A permissive rule that explicitly allows run.start, run.transition_state,
  // and run.record_evidence. Required for tests that exercise the success
  // path of the Run lifecycle (default-deny otherwise blocks all operations).
  const allowAllRule: PolicyRule = {
    ruleId: "test.allow-all",
    description: "Allow all run operations (test only)",
    appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
    evaluate: () => ({
      ruleId: "test.allow-all",
      ruleDescription: "Allow all run operations (test only)",
      outcome: "allow" as const,
      reason: "test allow",
    }),
  };

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    // Register the allow rule by default so lifecycle tests can proceed.
    registry.register(allowAllRule);
    engine = new DefaultPolicyEngine(registry);
    manager = new InMemoryRunManager(engine);
  });

  describe("createRun", () => {
    it("creates a Run in pending state", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      expect(run.state).toBe("pending");
      expect(run.inputs.taskKind).toBe("test-fix");
    });

    it("denies Run creation when no policy rule explicitly allows (default-deny)", () => {
      // Use a manager WITHOUT the allow rule
      const denyRegistry = new InMemoryPolicyRuleRegistry();
      for (const rule of BUILTIN_POLICY_RULES) denyRegistry.register(rule);
      // Note: do NOT register allowAllRule
      const denyEngine = new DefaultPolicyEngine(denyRegistry);
      const denyManager = new InMemoryRunManager(denyEngine);
      expect(() =>
        denyManager.createRun({
          runInputs: makeRunInputs(),
          contextPackId: asContextPackId("cp-1"),
          provenance: makeProvenance(),
        }),
      ).toThrow();
      try {
        denyManager.createRun({
          runInputs: makeRunInputs(),
          contextPackId: asContextPackId("cp-1"),
          provenance: makeProvenance(),
        });
      } catch (e) {
        expect(isPolicyDeniedError(e)).toBe(true);
      }
    });

    it("allows Run creation when a custom rule explicitly allows test-fix", () => {
      // (Covered by allowAllRule registered in beforeEach.)
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      expect(run.state).toBe("pending");
    });
  });

  describe("state transitions", () => {
    // Uses the allowAllRule registered in beforeEach.

    it("transitions pending → in_progress", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      const started = manager.startRun(run.id);
      expect(started.state).toBe("in_progress");
      expect(started.startedAt).toBeDefined();
    });

    it("FORBIDS pending → succeeded (must go through in_progress)", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      expect(() => manager.markSucceeded(run.id)).toThrow();
      try {
        manager.markSucceeded(run.id);
      } catch (e) {
        expect(isRunStateError(e)).toBe(true);
      }
    });

    it("FORBIDS succeeded → in_progress (terminal)", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      manager.startRun(run.id);
      manager.recordEvidence(run.id, "ev-1");
      manager.markSucceeded(run.id);
      expect(() => manager.startRun(run.id)).toThrow();
    });

    it("FORBIDS markSucceeded without Evidence (Evidence before claims)", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      manager.startRun(run.id);
      // No evidence recorded
      expect(() => manager.markSucceeded(run.id)).toThrow();
      try {
        manager.markSucceeded(run.id);
      } catch (e) {
        expect(isInsufficientEvidenceError(e)).toBe(true);
      }
    });

    it("ALLOWS markSucceeded when Evidence IS recorded", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      manager.startRun(run.id);
      manager.recordEvidence(run.id, "ev-1");
      const succ = manager.markSucceeded(run.id);
      expect(succ.state).toBe("succeeded");
      expect(succ.endedAt).toBeDefined();
    });

    it("records outputs only when in_progress", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      // pending — cannot record outputs
      expect(() =>
        manager.recordOutputs(run.id, { claimedOutcome: "succeeded" }),
      ).toThrow();
      manager.startRun(run.id);
      const withOutputs = manager.recordOutputs(run.id, {
        claimedOutcome: "succeeded",
        claimedSummary: "Tests passed",
      });
      expect(withOutputs.outputs?.claimedOutcome).toBe("succeeded");
    });

    it("markFailed transitions to terminal failed state", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      manager.startRun(run.id);
      const failed = manager.markFailed(run.id, "test failure");
      expect(failed.state).toBe("failed");
      expect(failed.endedAt).toBeDefined();
    });

    it("markAborted transitions to terminal aborted state (even from pending)", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: makeProvenance(),
      });
      const aborted = manager.markAborted(run.id, "user cancelled");
      expect(aborted.state).toBe("aborted");
    });

    it("getRun returns undefined for unknown Run IDs", () => {
      expect(manager.getRun(asRunId("nonexistent"))).toBeUndefined();
    });
  });
});
