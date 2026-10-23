/**
 * Stage B — Error code stability tests.
 *
 * Verifies that the structured error `code` field is:
 *   E1: Stable across instances (same error class always has the same code).
 *   E2: Distinct across error classes (no two classes share a code).
 *   E3: Independent of the error message (changing the message doesn't
 *       change the code).
 *   E4: JSON-serializable (so callers can switch on it across
 *       serialization boundaries).
 *
 * The code is the canonical way to switch on an error type; if it drifts
 * or collides, callers cannot reliably handle errors programmatically.
 */

import { describe, it, expect } from "vitest";
import {
  NemonsError,
  ContractValidationError,
  PolicyDeniedError,
  AdapterUnavailableError,
  LifecycleViolationError,
  InsufficientEvidenceError,
  RunStateError,
  isNemonsError,
  isPolicyDeniedError,
  isContractValidationError,
  isLifecycleViolationError,
  isInsufficientEvidenceError,
  isRunStateError,
  isAdapterUnavailableError,
} from "../../src/core/errors.js";
import { asPolicyDecisionId } from "../../src/core/identifiers.js";

/**
 * Factory functions for each error class. Different classes have
 * different constructor signatures (some take a primary key first,
 * then message + options), so we unify them via factories.
 */
type Factory = (message: string) => NemonsError;

const FACTORIES: ReadonlyArray<{ readonly name: string; readonly make: Factory; readonly cls: new (...args: never[]) => NemonsError }> = [
  {
    name: "ContractValidationError",
    cls: ContractValidationError as never,
    make: (msg) => new ContractValidationError(msg),
  },
  {
    name: "PolicyDeniedError",
    cls: PolicyDeniedError as never,
    make: (msg) => new PolicyDeniedError(asPolicyDecisionId("d-test"), msg),
  },
  {
    name: "AdapterUnavailableError",
    cls: AdapterUnavailableError as never,
    make: (msg) => new AdapterUnavailableError("mock", msg),
  },
  {
    name: "LifecycleViolationError",
    cls: LifecycleViolationError as never,
    make: (msg) => new LifecycleViolationError(msg),
  },
  {
    name: "InsufficientEvidenceError",
    cls: InsufficientEvidenceError as never,
    make: (msg) => new InsufficientEvidenceError(msg),
  },
  {
    name: "RunStateError",
    cls: RunStateError as never,
    make: (msg) => new RunStateError("pending", msg),
  },
];

describe("Stage B — error code stability", () => {
  describe("E1: same class always produces the same code", () => {
    for (const f of FACTORIES) {
      it(`${f.name} always has the same code across instances`, () => {
        const e1 = f.make("message A");
        const e2 = f.make("message B");
        expect(e1.code).toBe(e2.code);
      });
    }
  });

  describe("E2: distinct codes across classes (no collisions)", () => {
    it("all codes are distinct", () => {
      const codes = FACTORIES.map((f) => f.make("test").code);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it("every code starts with NEMONS_ prefix", () => {
      for (const f of FACTORIES) {
        const e = f.make("test");
        expect(e.code).toMatch(/^NEMONS_/);
      }
    });
  });

  describe("E3: code is independent of message", () => {
    for (const f of FACTORIES) {
      it(`${f.name} code does not change with the message`, () => {
        const e1 = f.make("message-A");
        const e2 = f.make("message-B-something-else");
        expect(e1.code).toBe(e2.code);
        // And the messages are different
        expect(e1.message).not.toBe(e2.message);
      });
    }
  });

  describe("E4: every error is JSON-serializable (toJSON produces code)", () => {
    for (const f of FACTORIES) {
      it(`${f.name} toJSON() produces a stable code field`, () => {
        const e = f.make("test message");
        const json = e.toJSON();
        expect(typeof json.code).toBe("string");
        expect(json.code).toBe(e.code);
        expect(json.message).toBe("test message");
      });
    }
  });

  describe("type guards switch on the right class", () => {
    it("isNemonsError is true for every NemonsError subclass", () => {
      for (const f of FACTORIES) {
        const e = f.make("test");
        expect(isNemonsError(e)).toBe(true);
      }
    });

    it("isNemonsError is false for plain Errors", () => {
      expect(isNemonsError(new Error("plain"))).toBe(false);
    });

    it("isPolicyDeniedError narrows PolicyDeniedError only", () => {
      const e = new PolicyDeniedError(asPolicyDecisionId("d"), "x");
      expect(isPolicyDeniedError(e)).toBe(true);
      // Other errors do not satisfy this guard
      expect(isPolicyDeniedError(new ContractValidationError("x"))).toBe(false);
      expect(isPolicyDeniedError(new AdapterUnavailableError("k", "x"))).toBe(false);
    });

    it("isContractValidationError narrows correctly", () => {
      const e = new ContractValidationError("x");
      expect(isContractValidationError(e)).toBe(true);
      expect(isContractValidationError(new PolicyDeniedError(asPolicyDecisionId("d"), "x"))).toBe(false);
    });

    it("isLifecycleViolationError narrows correctly", () => {
      const e = new LifecycleViolationError("x");
      expect(isLifecycleViolationError(e)).toBe(true);
    });

    it("isInsufficientEvidenceError narrows correctly", () => {
      const e = new InsufficientEvidenceError("x");
      expect(isInsufficientEvidenceError(e)).toBe(true);
    });

    it("isRunStateError narrows correctly", () => {
      const e = new RunStateError("pending", "x");
      expect(isRunStateError(e)).toBe(true);
    });

    it("isAdapterUnavailableError narrows correctly", () => {
      const e = new AdapterUnavailableError("k", "x");
      expect(isAdapterUnavailableError(e)).toBe(true);
    });
  });

  describe("error details propagate", () => {
    it("details are preserved through toJSON", () => {
      const e = new ContractValidationError("x", {
        details: { field: "id", value: 42, nested: { ok: true } },
      });
      const json = e.toJSON();
      expect(json.details).toEqual({ field: "id", value: 42, nested: { ok: true } });
    });

    it("details are optional (undefined when not provided)", () => {
      const e = new ContractValidationError("x");
      expect(e.details).toBeUndefined();
      expect(e.toJSON().details).toBeUndefined();
    });
  });

  describe("code registry — explicit enumeration for documentation", () => {
    // This is the canonical list of error codes. If a new code is added,
    // it MUST be added here so callers can audit the full surface.
    const EXPECTED_CODES = [
      "NEMONS_CONTRACT_VALIDATION_ERROR",
      "NEMONS_POLICY_DENIED",
      "NEMONS_ADAPTER_UNAVAILABLE",
      "NEMONS_LIFECYCLE_VIOLATION",
      "NEMONS_INSUFFICIENT_EVIDENCE",
      "NEMONS_RUN_STATE_ERROR",
    ];

    it("every expected code is produced by exactly one error class", () => {
      const codes = FACTORIES.map((f) => f.make("x").code);
      for (const expected of EXPECTED_CODES) {
        expect(codes).toContain(expected);
      }
      // And the count matches
      expect(codes.length).toBe(EXPECTED_CODES.length);
    });
  });

  describe("primary key fields are preserved", () => {
    it("PolicyDeniedError preserves decisionId", () => {
      const id = asPolicyDecisionId("d-xyz");
      const e = new PolicyDeniedError(id, "denied");
      expect(e.decisionId).toBe(id);
    });

    it("AdapterUnavailableError preserves adapterKind", () => {
      const e = new AdapterUnavailableError("openhands", "not registered");
      expect(e.adapterKind).toBe("openhands");
    });

    it("RunStateError preserves runState", () => {
      const e = new RunStateError("succeeded", "terminal");
      expect(e.runState).toBe("succeeded");
    });
  });
});
