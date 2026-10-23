/**
 * Action Interception tests (ADR-0016 — from Mid-Harness).
 *
 * Verifies:
 *   AI1: ProposedAction + ActionVerdict types work correctly.
 *   AI2: DefaultActionInterceptor allows safe actions.
 *   AI3: DefaultActionInterceptor denies actions matching Persona mustNot.
 *   AI4: DefaultActionInterceptor denies destructive actions by default.
 *   AI5: DefaultActionInterceptor allows destructive when denyDestructive=false.
 *   AI6: Custom verifiers are called in order.
 *   AI7: Custom verifier's deny overrides allow.
 *   AI8: All action kinds are supported.
 *   AI9: isActionAllowed + isActionDenied helpers.
 *   AI10: interceptor without Persona or custom verifiers → allow everything.
 *   AI11: mustNot pattern matching is case-sensitive substring.
 *   AI12: backward compatibility — AdapterContract without interception fields.
 */

import { describe, it, expect } from "vitest";
import {
  DefaultActionInterceptor,
  isActionAllowed,
  isActionDenied,
} from "../../src/adapter/default-action-interceptor.js";
import type { ProposedAction, ActionVerdict, AdapterContract } from "../../src/adapter/adapter-contract.js";
import type { Persona } from "../../src/schemas/persona.js";
import { MockAdapter } from "../../src/adapter/mock-adapter.js";
import { asPersonaId } from "../../src/core/identifiers.js";

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: asPersonaId("p-test"),
    version: "1.0.0",
    provenance: {
      kind: "approved",
      source: { kind: "human", actor: "x", at: "2024-01-01T00:00:00Z" },
    },
    role: "Test-Fix Engineer",
    responsibilities: ["fix tests"],
    workingApproach: "isolate, fix, verify",
    constraints: {
      mustNot: ["rm -rf", "git push --force"],
    },
    applicability: { taskKinds: ["test-fix"] },
    ...overrides,
  };
}

function makeAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    kind: "shell",
    command: "npm test",
    description: "Run the test suite",
    estimatedImpact: "read-only",
    ...overrides,
  };
}

describe("Action Interception (ADR-0016 — Mid-Harness)", () => {
  describe("AI2 + AI10: allow safe actions", () => {
    it("AI2: allows a read-only shell action", () => {
      const interceptor = new DefaultActionInterceptor();
      const action = makeAction({ kind: "shell", command: "npm test", estimatedImpact: "read-only" });
      const verdict = interceptor.verifyAction(action);
      expect(verdict.kind).toBe("allow");
    });

    it("AI10: interceptor without Persona or custom verifiers → allow everything", () => {
      const interceptor = new DefaultActionInterceptor();
      const action = makeAction({ estimatedImpact: "write" });
      expect(interceptor.verifyAction(action).kind).toBe("allow");
    });
  });

  describe("AI3: deny actions matching Persona mustNot", () => {
    it("denies 'rm -rf' when Persona has mustNot=['rm -rf']", () => {
      const interceptor = new DefaultActionInterceptor({
        persona: makePersona({ constraints: { mustNot: ["rm -rf"] } }),
      });
      const action = makeAction({
        command: "rm -rf /tmp/test",
        description: "Delete test directory",
        estimatedImpact: "destructive",
      });
      const verdict = interceptor.verifyAction(action);
      expect(verdict.kind).toBe("deny");
      if (verdict.kind === "deny") {
        expect(verdict.reason).toContain("rm -rf");
      }
    });

    it("denies 'git push --force' when Persona has mustNot", () => {
      const interceptor = new DefaultActionInterceptor({
        persona: makePersona({ constraints: { mustNot: ["git push --force"] } }),
      });
      const action = makeAction({
        kind: "git",
        command: "git push --force origin main",
        estimatedImpact: "destructive",
      });
      const verdict = interceptor.verifyAction(action);
      expect(verdict.kind).toBe("deny");
    });

    it("allows 'npm test' when mustNot only has 'rm -rf'", () => {
      const interceptor = new DefaultActionInterceptor({
        persona: makePersona({ constraints: { mustNot: ["rm -rf"] } }),
      });
      const action = makeAction({ command: "npm test", estimatedImpact: "read-only" });
      expect(interceptor.verifyAction(action).kind).toBe("allow");
    });
  });

  describe("AI4 + AI5: destructive impact", () => {
    it("AI4: denies destructive actions by default", () => {
      const interceptor = new DefaultActionInterceptor();
      const action = makeAction({ estimatedImpact: "destructive" });
      const verdict = interceptor.verifyAction(action);
      expect(verdict.kind).toBe("deny");
      if (verdict.kind === "deny") {
        expect(verdict.reason).toContain("destructive");
      }
    });

    it("AI5: allows destructive when denyDestructive=false", () => {
      const interceptor = new DefaultActionInterceptor({ denyDestructiveByDefault: false });
      const action = makeAction({ estimatedImpact: "destructive" });
      expect(interceptor.verifyAction(action).kind).toBe("allow");
    });

    it("allows write actions by default", () => {
      const interceptor = new DefaultActionInterceptor();
      const action = makeAction({ estimatedImpact: "write" });
      expect(interceptor.verifyAction(action).kind).toBe("allow");
    });
  });

  describe("AI6 + AI7: custom verifiers", () => {
    it("AI6: custom verifier is called", () => {
      const customVerifier = (action: ProposedAction): ActionVerdict | undefined => {
        if (action.command?.includes("forbidden")) {
          return { kind: "deny", reason: "Custom verifier: forbidden command" };
        }
        return undefined;
      };
      const interceptor = new DefaultActionInterceptor({
        customVerifiers: [customVerifier],
      });
      const action = makeAction({ command: "forbidden command" });
      const verdict = interceptor.verifyAction(action);
      expect(verdict.kind).toBe("deny");
      if (verdict.kind === "deny") {
        expect(verdict.reason).toContain("Custom verifier");
      }
    });

    it("AI7: first verifier's deny wins", () => {
      const v1 = (_a: ProposedAction): ActionVerdict | undefined => ({
        kind: "deny",
        reason: "First verifier denied",
      });
      const v2 = (_a: ProposedAction): ActionVerdict | undefined => ({
        kind: "allow" as never,
        reason: "",
      });
      const interceptor = new DefaultActionInterceptor({
        customVerifiers: [v1, v2],
      });
      const action = makeAction();
      const verdict = interceptor.verifyAction(action);
      expect(verdict.kind).toBe("deny");
      if (verdict.kind === "deny") {
        expect(verdict.reason).toContain("First verifier");
      }
    });

    it("custom verifier returning undefined → falls through to allow", () => {
      const noop = (_a: ProposedAction): ActionVerdict | undefined => undefined;
      const interceptor = new DefaultActionInterceptor({ customVerifiers: [noop] });
      const action = makeAction({ estimatedImpact: "read-only" });
      expect(interceptor.verifyAction(action).kind).toBe("allow");
    });
  });

  describe("AI8: all action kinds supported", () => {
    const kinds: ProposedAction["kind"][] = ["shell", "file.read", "file.write", "git", "test", "other"];
    for (const kind of kinds) {
      it(`supports kind: ${kind}`, () => {
        const interceptor = new DefaultActionInterceptor();
        const action = makeAction({ kind, estimatedImpact: "read-only" });
        const verdict = interceptor.verifyAction(action);
        expect(verdict.kind).toBe("allow");
      });
    }
  });

  describe("AI9: helpers", () => {
    it("isActionAllowed returns true for allow", () => {
      expect(isActionAllowed({ kind: "allow" })).toBe(true);
    });

    it("isActionAllowed returns false for deny", () => {
      expect(isActionAllowed({ kind: "deny", reason: "x" })).toBe(false);
    });

    it("isActionDenied returns true for deny", () => {
      expect(isActionDenied({ kind: "deny", reason: "x" })).toBe(true);
    });

    it("isActionDenied returns false for allow", () => {
      expect(isActionDenied({ kind: "allow" })).toBe(false);
    });
  });

  describe("AI11: mustNot pattern matching", () => {
    it("matches substring in command", () => {
      const interceptor = new DefaultActionInterceptor({
        persona: makePersona({ constraints: { mustNot: ["dangerous"] } }),
      });
      const action = makeAction({ command: "run dangerous script" });
      expect(interceptor.verifyAction(action).kind).toBe("deny");
    });

    it("matches substring in args", () => {
      const interceptor = new DefaultActionInterceptor({
        persona: makePersona({ constraints: { mustNot: ["--no-cache"] } }),
      });
      const action = makeAction({
        command: "npm",
        args: ["test", "--no-cache"],
      });
      expect(interceptor.verifyAction(action).kind).toBe("deny");
    });

    it("does NOT match when pattern is absent", () => {
      const interceptor = new DefaultActionInterceptor({
        persona: makePersona({ constraints: { mustNot: ["nonexistent"] } }),
      });
      const action = makeAction({ command: "npm test" });
      expect(interceptor.verifyAction(action).kind).toBe("allow");
    });
  });

  describe("AI12: backward compatibility", () => {
    it("AdapterContract without supportsActionInterception is valid", () => {
      const adapter = new MockAdapter() as AdapterContract;
      expect(adapter.supportsActionInterception).toBeUndefined();
      expect(typeof adapter.invoke).toBe("function");
    });
  });

  describe("AI13: order of checks (Persona mustNot before destructive)", () => {
    it("Persona mustNot is checked before destructive impact", () => {
      const interceptor = new DefaultActionInterceptor({
        persona: makePersona({ constraints: { mustNot: ["specific-command"] } }),
        denyDestructiveByDefault: true,
      });
      const action = makeAction({
        command: "specific-command with args",
        estimatedImpact: "destructive",
      });
      const verdict = interceptor.verifyAction(action);
      expect(verdict.kind).toBe("deny");
      if (verdict.kind === "deny") {
        // The reason should mention the mustNot pattern, not the destructive impact
        expect(verdict.reason).toContain("mustNot");
        expect(verdict.reason).toContain("specific-command");
      }
    });
  });
});
