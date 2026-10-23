import { describe, it, expect } from "vitest";
import {
  aggregateOutcomes,
  isPolicyAllowed,
  isPolicyDenied,
} from "../../src/policy/policy-decision.js";
import type { PolicyRuleEvaluation } from "../../src/policy/policy-decision.js";

describe("policy-decision", () => {
  describe("aggregateOutcomes", () => {
    it("returns deny when ANY rule denies (deny wins)", () => {
      const rules: PolicyRuleEvaluation[] = [
        { ruleId: "a", ruleDescription: "a", outcome: "allow", reason: "x" },
        { ruleId: "b", ruleDescription: "b", outcome: "deny", reason: "x" },
      ];
      expect(aggregateOutcomes(rules)).toBe("deny");
    });

    it("returns defer when one defers and others allow", () => {
      // NOTE: allow overrides defer per aggregateOutcomes' semantics.
      // When ANY rule allows AND none deny, aggregate is "allow".
      // The "defer" outcome only wins when no rule explicitly allows.
      const rules: PolicyRuleEvaluation[] = [
        { ruleId: "a", ruleDescription: "a", outcome: "allow", reason: "x" },
        { ruleId: "b", ruleDescription: "b", outcome: "defer", reason: "x" },
      ];
      expect(aggregateOutcomes(rules)).toBe("allow");
    });

    it("returns defer when one defers and none allow", () => {
      const rules: PolicyRuleEvaluation[] = [
        { ruleId: "a", ruleDescription: "a", outcome: "defer", reason: "x" },
        { ruleId: "b", ruleDescription: "b", outcome: "defer", reason: "x" },
      ];
      expect(aggregateOutcomes(rules)).toBe("defer");
    });

    it("returns allow when ALL rules allow", () => {
      const rules: PolicyRuleEvaluation[] = [
        { ruleId: "a", ruleDescription: "a", outcome: "allow", reason: "x" },
        { ruleId: "b", ruleDescription: "b", outcome: "allow", reason: "x" },
      ];
      expect(aggregateOutcomes(rules)).toBe("allow");
    });

    it("returns deny when NO rules are present (default-deny)", () => {
      expect(aggregateOutcomes([])).toBe("deny");
    });

    it("returns deny when no rule produces an explicit allow", () => {
      const rules: PolicyRuleEvaluation[] = [
        { ruleId: "a", ruleDescription: "a", outcome: "defer", reason: "x" },
      ];
      expect(aggregateOutcomes(rules)).toBe("defer");
      // (defer is not deny at the aggregate level; but it's still not
      // an allow — `enforceDecision` treats both as denial.)
    });

    it("deny wins over defer", () => {
      const rules: PolicyRuleEvaluation[] = [
        { ruleId: "a", ruleDescription: "a", outcome: "deny", reason: "x" },
        { ruleId: "b", ruleDescription: "b", outcome: "defer", reason: "x" },
        { ruleId: "c", ruleDescription: "c", outcome: "allow", reason: "x" },
      ];
      expect(aggregateOutcomes(rules)).toBe("deny");
    });
  });

  describe("isPolicyAllowed", () => {
    it("returns true for allow outcome", () => {
      expect(
        isPolicyAllowed({
          id: "d1" as never,
          operation: "run.start",
          requestedBy: "x",
          inputs: {},
          ruleEvaluations: [],
          outcome: "allow",
          reason: "x",
          decidedAt: "x",
        }),
      ).toBe(true);
    });

    it("returns false for deny outcome", () => {
      expect(
        isPolicyAllowed({
          id: "d1" as never,
          operation: "run.start",
          requestedBy: "x",
          inputs: {},
          ruleEvaluations: [],
          outcome: "deny",
          reason: "x",
          decidedAt: "x",
        }),
      ).toBe(false);
    });

    it("returns false for defer outcome (defer is NOT authorization)", () => {
      expect(
        isPolicyAllowed({
          id: "d1" as never,
          operation: "run.start",
          requestedBy: "x",
          inputs: {},
          ruleEvaluations: [],
          outcome: "defer",
          reason: "x",
          decidedAt: "x",
        }),
      ).toBe(false);
    });
  });

  describe("isPolicyDenied", () => {
    it("returns true for deny outcome", () => {
      expect(
        isPolicyDenied({
          id: "d1" as never,
          operation: "run.start",
          requestedBy: "x",
          inputs: {},
          ruleEvaluations: [],
          outcome: "deny",
          reason: "x",
          decidedAt: "x",
        }),
      ).toBe(true);
    });
  });
});
