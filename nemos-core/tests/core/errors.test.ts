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
} from "../../src/core/errors.js";
import { asPolicyDecisionId } from "../../src/core/identifiers.js";

describe("errors", () => {
  describe("NemonsError base class", () => {
    it("carries a code and message", () => {
      const e = new ContractValidationError("bad input");
      expect(e.code).toBe("NEMONS_CONTRACT_VALIDATION_ERROR");
      expect(e.message).toBe("bad input");
      expect(e.name).toBe("ContractValidationError");
    });

    it("carries optional details", () => {
      const e = new ContractValidationError("bad input", {
        details: { field: "id" },
      });
      expect(e.details).toEqual({ field: "id" });
    });

    it("serializes to JSON without losing the code", () => {
      const e = new ContractValidationError("bad", { details: { x: 1 } });
      const j = e.toJSON();
      expect(j.code).toBe("NEMONS_CONTRACT_VALIDATION_ERROR");
      expect(j.message).toBe("bad");
      expect(j.details).toEqual({ x: 1 });
    });
  });

  describe("PolicyDeniedError", () => {
    it("carries the decisionId", () => {
      const id = asPolicyDecisionId("d-1");
      const e = new PolicyDeniedError(id, "denied");
      expect(e.decisionId).toBe(id);
      expect(e.code).toBe("NEMONS_POLICY_DENIED");
    });
  });

  describe("AdapterUnavailableError", () => {
    it("carries the adapterKind", () => {
      const e = new AdapterUnavailableError("openhands", "not registered");
      expect(e.adapterKind).toBe("openhands");
      expect(e.code).toBe("NEMONS_ADAPTER_UNAVAILABLE");
    });
  });

  describe("RunStateError", () => {
    it("carries the runState", () => {
      const e = new RunStateError("pending", "cannot record outputs");
      expect(e.runState).toBe("pending");
      expect(e.code).toBe("NEMONS_RUN_STATE_ERROR");
    });
  });

  describe("LifecycleViolationError", () => {
    it("has the correct code", () => {
      const e = new LifecycleViolationError("use not allowed");
      expect(e.code).toBe("NEMONS_LIFECYCLE_VIOLATION");
    });
  });

  describe("InsufficientEvidenceError", () => {
    it("has the correct code", () => {
      const e = new InsufficientEvidenceError("no evidence");
      expect(e.code).toBe("NEMONS_INSUFFICIENT_EVIDENCE");
    });
  });

  describe("type guards", () => {
    it("isNemonsError identifies all subclasses", () => {
      expect(isNemonsError(new ContractValidationError("x"))).toBe(true);
      expect(isNemonsError(new PolicyDeniedError(asPolicyDecisionId("d"), "x"))).toBe(true);
      expect(isNemonsError(new AdapterUnavailableError("k", "x"))).toBe(true);
      expect(isNemonsError(new LifecycleViolationError("x"))).toBe(true);
      expect(isNemonsError(new InsufficientEvidenceError("x"))).toBe(true);
      expect(isNemonsError(new RunStateError("s", "x"))).toBe(true);
    });

    it("isNemonsError rejects non-Nemons errors", () => {
      expect(isNemonsError(new Error("plain"))).toBe(false);
      expect(isNemonsError("string")).toBe(false);
      expect(isNemonsError(null)).toBe(false);
    });

    it("isPolicyDeniedError narrows correctly", () => {
      const e = new PolicyDeniedError(asPolicyDecisionId("d"), "denied");
      expect(isPolicyDeniedError(e)).toBe(true);
      expect(isPolicyDeniedError(new ContractValidationError("x"))).toBe(false);
    });

    it("isContractValidationError narrows correctly", () => {
      const e = new ContractValidationError("bad");
      expect(isContractValidationError(e)).toBe(true);
      expect(isContractValidationError(new Error("x"))).toBe(false);
    });

    it("isLifecycleViolationError narrows correctly", () => {
      const e = new LifecycleViolationError("x");
      expect(isLifecycleViolationError(e)).toBe(true);
    });

    it("isInsufficientEvidenceError narrows correctly", () => {
      const e = new InsufficientEvidenceError("no evidence");
      expect(isInsufficientEvidenceError(e)).toBe(true);
    });
  });

  describe("NemonsError inheritance", () => {
    it("all errors extend NemonsError", () => {
      expect(new ContractValidationError("x") instanceof NemonsError).toBe(true);
      expect(new PolicyDeniedError(asPolicyDecisionId("d"), "x") instanceof NemonsError).toBe(true);
      expect(new AdapterUnavailableError("k", "x") instanceof NemonsError).toBe(true);
      expect(new LifecycleViolationError("x") instanceof NemonsError).toBe(true);
      expect(new InsufficientEvidenceError("x") instanceof NemonsError).toBe(true);
      expect(new RunStateError("s", "x") instanceof NemonsError).toBe(true);
    });

    it("all errors extend Error", () => {
      expect(new ContractValidationError("x") instanceof Error).toBe(true);
    });
  });
});
