import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import type { PolicyRule } from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine, enforceDecision } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import { isPolicyDeniedError } from "../../src/core/errors.js";

describe("policy-engine", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let engine: DefaultPolicyEngine;

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) {
      registry.register(rule);
    }
    engine = new DefaultPolicyEngine(registry);
  });

  describe("DefaultPolicyEngine.decide", () => {
    it("denies (or defers) when no rule explicitly allows (default-deny)", () => {
      const d = engine.decide({
        operation: "run.start",
        requestedBy: "tester",
        inputs: { taskKind: "test-fix" },
      });
      // run.start has no built-in allow rule → outcome is defer
      // (default-deny baseline defers). Enforcement treats defer as deny.
      expect(d.outcome === "deny" || d.outcome === "defer").toBe(true);
    });

    it("denies when lifecycle gate sees a deprecated asset", () => {
      const d = engine.decide({
        operation: "context_pack.select_asset",
        requestedBy: "tester",
        inputs: {},
        assetProvenanceKind: "deprecated",
      });
      expect(d.outcome).toBe("deny");
    });

    it("defers when lifecycle gate sees a non-approved, non-deprecated asset", () => {
      const d = engine.decide({
        operation: "context_pack.select_asset",
        requestedBy: "tester",
        inputs: {},
        assetProvenanceKind: "reviewed",
      });
      // No explicit allow rule fires; lifecycle-gate defers; default-deny
      // baseline also defers; final = defer
      expect(d.outcome).toBe("defer");
    });

    it("allows when lifecycle gate sees an approved asset", () => {
      const d = engine.decide({
        operation: "context_pack.select_asset",
        requestedBy: "tester",
        inputs: {},
        assetProvenanceKind: "approved",
      });
      expect(d.outcome).toBe("allow");
    });

    it("denies candidate inclusion when experimentalRun is false", () => {
      const d = engine.decide({
        operation: "context_pack.include_candidate",
        requestedBy: "tester",
        inputs: { experimentalRun: false },
        assetProvenanceKind: "proposed",
      });
      // NoCandidatePromotionRule returns deny when experimentalRun is false.
      expect(d.outcome).toBe("deny");
    });

    it("denies candidate inclusion when experimentalRun is true but asset is deprecated", () => {
      const d = engine.decide({
        operation: "context_pack.include_candidate",
        requestedBy: "tester",
        inputs: { experimentalRun: true },
        assetProvenanceKind: "deprecated",
      });
      expect(d.outcome).toBe("deny");
    });

    it("denies promotion operations without governedReview", () => {
      const d = engine.decide({
        operation: "skill.promote",
        requestedBy: "tester",
        inputs: { governedReview: false },
        assetProvenanceKind: "reviewed",
      });
      expect(d.outcome).toBe("deny");
    });

    it("allows promotion operations WITH governedReview (when asset is reviewed)", () => {
      const d = engine.decide({
        operation: "skill.promote",
        requestedBy: "tester",
        inputs: { governedReview: true },
        assetProvenanceKind: "reviewed",
      });
      expect(d.outcome).toBe("allow");
    });

    it("allows candidate inclusion when experimentalRun is true and asset is proposed", () => {
      const d = engine.decide({
        operation: "context_pack.include_candidate",
        requestedBy: "tester",
        inputs: { experimentalRun: true },
        assetProvenanceKind: "proposed",
      });
      // NoCandidatePromotionRule returns allow when experimentalRun is true.
      // Lifecycle gate for "proposed" defers; default-deny baseline defers.
      // But NoCandidatePromotionRule returns allow → aggregate = allow.
      expect(d.outcome).toBe("allow");
    });
  });

  describe("enforceDecision", () => {
    it("throws PolicyDeniedError when decision is deny", () => {
      const d = engine.decide({
        operation: "run.start",
        requestedBy: "tester",
        inputs: { taskKind: "test-fix" },
      });
      expect(() => enforceDecision(d)).toThrow();
      try {
        enforceDecision(d);
      } catch (e) {
        expect(isPolicyDeniedError(e)).toBe(true);
      }
    });

    it("does NOT throw when decision is allow", () => {
      const d = engine.decide({
        operation: "context_pack.select_asset",
        requestedBy: "tester",
        inputs: {},
        assetProvenanceKind: "approved",
      });
      expect(() => enforceDecision(d)).not.toThrow();
    });

    it("throws for defer (defer is not authorization)", () => {
      const d = engine.decide({
        operation: "context_pack.select_asset",
        requestedBy: "tester",
        inputs: {},
        assetProvenanceKind: "reviewed",
      });
      // Defer is NOT allow; enforceDecision treats defer as denial.
      expect(d.outcome).toBe("defer");
      expect(() => enforceDecision(d)).toThrow();
    });
  });

  describe("built-in rule registry", () => {
    it("registers all built-in rules", () => {
      expect(registry.listAll()).toHaveLength(BUILTIN_POLICY_RULES.length);
    });

    it("rulesFor returns only applicable rules for an operation", () => {
      const rules = registry.rulesFor("skill.promote");
      // skill.promote should be covered by: default-deny + no-implicit-trust-escalation
      expect(rules.length).toBeGreaterThanOrEqual(2);
      const ids = rules.map((r) => r.ruleId);
      expect(ids).toContain("nemons.builtin.default-deny");
      expect(ids).toContain("nemons.builtin.no-implicit-trust-escalation");
    });
  });

  describe("custom rule registration", () => {
    it("allows adding custom rules alongside built-ins", () => {
      const customRule: PolicyRule = {
        ruleId: "test.custom-allow-test-fix",
        description: "Allow test-fix runs",
        appliesTo: ["run.start"],
        evaluate: (ctx) => ({
          ruleId: "test.custom-allow-test-fix",
          ruleDescription: "Allow test-fix runs",
          outcome: ctx.inputs.taskKind === "test-fix" ? "allow" : "deny",
          reason: ctx.inputs.taskKind === "test-fix" ? "Test-fix allowed" : "Not test-fix",
        }),
      };
      registry.register(customRule);

      const d = engine.decide({
        operation: "run.start",
        requestedBy: "tester",
        inputs: { taskKind: "test-fix" },
      });
      expect(d.outcome).toBe("allow");
    });

    it("prevents duplicate registration of the same ruleId", () => {
      const rule: PolicyRule = {
        ruleId: "dup",
        description: "x",
        appliesTo: ["run.start"],
        evaluate: () => ({ ruleId: "dup", ruleDescription: "x", outcome: "deny", reason: "x" }),
      };
      registry.register(rule);
      expect(() => registry.register(rule)).toThrowError(/already registered/);
    });
  });
});
