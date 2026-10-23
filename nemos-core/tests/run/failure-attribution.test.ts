/**
 * Failure Attribution tests (ADR-0010 — from MAST research).
 *
 * Verifies:
 *   FA1: markFailed without attribution → failureAttribution is undefined.
 *   FA2: markFailed WITH attribution → failureAttribution is persisted.
 *   FA3: the attribution category is queryable.
 *   FA4: all 8 attribution categories are supported.
 *   FA5: the attribution includes description + attributedBy + attributedAt.
 *   FA6: the attribution is preserved on the Run after markFailed.
 *   FA7: existing markFailed callers (no attribution) still work.
 *   FA8: the Run schema validates failureAttribution when present.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { InMemoryRunManager } from "../../src/run/run-manager.js";
import type { RunInputs, FailureAttribution, Run } from "../../src/schemas/run.js";
import { validateRun } from "../../src/schemas/run.js";
import { asRunId, asContextPackId } from "../../src/core/identifiers.js";

const allowAllRule: PolicyRule = {
  ruleId: "test.fa.allow-all",
  description: "Allow all run operations (failure attribution test)",
  appliesTo: ["run.start", "run.transition_state", "run.record_evidence"],
  evaluate: () => ({
    ruleId: "test.fa.allow-all",
    ruleDescription: "Allow all",
    outcome: "allow" as const,
    reason: "test",
  }),
};

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

function makeAttribution(
  overrides: Partial<FailureAttribution> = {},
): FailureAttribution {
  return {
    category: "model",
    description: "The model produced an incorrect output.",
    attributedBy: "test-attributor",
    attributedAt: "2024-01-01T12:00:00Z",
    ...overrides,
  };
}

describe("Failure Attribution (ADR-0010 — MAST)", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let engine: DefaultPolicyEngine;
  let manager: InMemoryRunManager;

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    registry.register(allowAllRule);
    engine = new DefaultPolicyEngine(registry);
    manager = new InMemoryRunManager(engine);
  });

  describe("FA1 + FA7: markFailed without attribution", () => {
    it("FA1: failureAttribution is undefined when no attribution provided", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      manager.startRun(run.id);
      const failed = manager.markFailed(run.id, "test failure");
      expect(failed.state).toBe("failed");
      expect(failed.failureAttribution).toBeUndefined();
    });

    it("FA7: existing markFailed callers (no attribution) still work", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      manager.startRun(run.id);
      // Existing call signature: markFailed(runId, reason)
      const failed = manager.markFailed(run.id, "legacy failure");
      expect(failed.state).toBe("failed");
      expect(failed.failureAttribution).toBeUndefined();
    });
  });

  describe("FA2 + FA6: markFailed WITH attribution", () => {
    it("FA2: failureAttribution is persisted when provided", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      manager.startRun(run.id);
      const attribution = makeAttribution({
        category: "skill",
        description: "The selected Skill was wrong for this task.",
      });
      const failed = manager.markFailed(run.id, "skill mismatch", attribution);
      expect(failed.failureAttribution).toBeDefined();
      expect(failed.failureAttribution?.category).toBe("skill");
      expect(failed.failureAttribution?.description).toContain("Skill was wrong");
    });

    it("FA6: the attribution is preserved on the Run after markFailed", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      manager.startRun(run.id);
      const attribution = makeAttribution({
        category: "tool",
        description: "The git tool returned an error.",
        evidenceRefs: ["ev-1"],
        attributedBy: "analyzer-bot",
        attributedAt: "2024-01-01T12:30:00Z",
      });
      manager.markFailed(run.id, "tool error", attribution);

      // Re-read the Run
      const stored = manager.getRun(run.id)!;
      expect(stored.failureAttribution).toBeDefined();
      expect(stored.failureAttribution?.category).toBe("tool");
      expect(stored.failureAttribution?.description).toContain("git tool");
      expect(stored.failureAttribution?.evidenceRefs).toEqual(["ev-1"]);
      expect(stored.failureAttribution?.attributedBy).toBe("analyzer-bot");
      expect(stored.failureAttribution?.attributedAt).toBe("2024-01-01T12:30:00Z");
    });
  });

  describe("FA3 + FA4: all attribution categories", () => {
    const categories: FailureAttribution["category"][] = [
      "model",
      "harness",
      "skill",
      "knowledge",
      "tool",
      "policy",
      "environment",
      "unknown",
    ];

    for (const category of categories) {
      it(`supports category: ${category}`, () => {
        const run = manager.createRun({
          runInputs: makeRunInputs(),
          contextPackId: asContextPackId("cp-1"),
          provenance: {
            kind: "observed",
            source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
          },
        });
        manager.startRun(run.id);
        const attribution = makeAttribution({
          category,
          description: `Failure attributed to ${category}`,
        });
        const failed = manager.markFailed(run.id, `${category} failure`, attribution);
        expect(failed.failureAttribution?.category).toBe(category);
      });
    }
  });

  describe("FA5: attribution includes all fields", () => {
    it("the attribution has description + attributedBy + attributedAt", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      manager.startRun(run.id);
      const attribution = makeAttribution({
        category: "environment",
        description: "The filesystem was full.",
        attributedBy: "system-monitor",
        attributedAt: "2024-01-01T15:00:00Z",
      });
      const failed = manager.markFailed(run.id, "disk full", attribution);

      expect(failed.failureAttribution?.category).toBe("environment");
      expect(failed.failureAttribution?.description).toBe("The filesystem was full.");
      expect(failed.failureAttribution?.attributedBy).toBe("system-monitor");
      expect(failed.failureAttribution?.attributedAt).toBe("2024-01-01T15:00:00Z");
    });

    it("the attribution can include evidenceRefs", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      manager.startRun(run.id);
      const attribution = makeAttribution({
        category: "model",
        description: "Model hallucinated a function that doesn't exist.",
        evidenceRefs: ["ev-trace-1", "ev-trace-2"],
      });
      const failed = manager.markFailed(run.id, "hallucination", attribution);
      expect(failed.failureAttribution?.evidenceRefs).toEqual(["ev-trace-1", "ev-trace-2"]);
    });
  });

  describe("FA8: Run schema validates failureAttribution", () => {
    it("a Run with failureAttribution passes validateRun", () => {
      const run = {
        id: "r-1",
        state: "failed",
        inputs: {
          taskDescription: "Fix test",
          taskKind: "test-fix",
          repoInstance: {
            repoIdentity: { repo: "x", sha: "y" },
            instanceId: "i",
          },
        },
        contextPackId: "cp-1",
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
        failureAttribution: {
          category: "model",
          description: "Model failed",
          attributedBy: "system",
          attributedAt: "2024-01-01T00:00:00Z",
        },
      };
      expect(() => validateRun(run)).not.toThrow();
    });

    it("a Run without failureAttribution also passes validateRun", () => {
      const run = {
        id: "r-1",
        state: "failed",
        inputs: {
          taskDescription: "Fix test",
          taskKind: "test-fix",
          repoInstance: {
            repoIdentity: { repo: "x", sha: "y" },
            instanceId: "i",
          },
        },
        contextPackId: "cp-1",
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "x", at: "x" },
        },
        // no failureAttribution
      };
      expect(() => validateRun(run)).not.toThrow();
    });
  });

  describe("FA9: 'a failure is not automatically a Skill failure'", () => {
    it("the attribution distinguishes skill failures from other causes", () => {
      const run = manager.createRun({
        runInputs: makeRunInputs(),
        contextPackId: asContextPackId("cp-1"),
        provenance: {
          kind: "observed",
          source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
        },
      });
      manager.startRun(run.id);

      // Attribute to "model" — NOT "skill"
      const attribution = makeAttribution({
        category: "model",
        description: "The model produced a syntactically invalid function.",
      });
      const failed = manager.markFailed(run.id, "model error", attribution);

      // CRITICAL: the failure is attributed to "model", NOT "skill"
      expect(failed.failureAttribution?.category).toBe("model");
      expect(failed.failureAttribution?.category).not.toBe("skill");
    });
  });
});
