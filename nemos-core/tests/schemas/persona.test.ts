import { describe, it, expect } from "vitest";
import {
  validatePersona,
  isPersonaApproved,
  isPersonaDeprecated,
} from "../../src/schemas/persona.js";
import type { Persona } from "../../src/schemas/persona.js";
import { asPersonaId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: asPersonaId("p-1"),
    version: "1.0.0",
    provenance: {
      kind: "approved",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    role: "Test-Fix Engineer",
    responsibilities: ["fix failing tests", "verify with test run"],
    workingApproach: "Run the failing test, isolate the cause, fix minimally, re-run.",
    constraints: { mustNot: ["modify unrelated files"], scope: ["src/"] },
    applicability: { taskKinds: ["test-fix"] },
    ...overrides,
  };
}

describe("persona schema", () => {
  describe("validatePersona", () => {
    it("accepts a valid Persona", () => {
      expect(() => validatePersona(makePersona())).not.toThrow();
    });

    it("rejects a null value", () => {
      expect(() => validatePersona(null)).toThrowError(ContractValidationError);
    });

    it("rejects a non-object", () => {
      expect(() => validatePersona("not an object")).toThrowError(ContractValidationError);
      expect(() => validatePersona(42)).toThrowError(ContractValidationError);
    });

    it("rejects an empty id", () => {
      expect(() =>
        validatePersona(makePersona({ id: asPersonaId("") })),
      ).toThrowError(ContractValidationError);
    });

    it("rejects an empty version", () => {
      expect(() => validatePersona(makePersona({ version: "" }))).toThrowError(ContractValidationError);
    });

    it("rejects a missing provenance", () => {
      const p = makePersona() as unknown as Record<string, unknown>;
      delete p.provenance;
      expect(() => validatePersona(p)).toThrowError(ContractValidationError);
    });

    it("rejects an empty role", () => {
      expect(() => validatePersona(makePersona({ role: "" }))).toThrowError(ContractValidationError);
    });

    it("rejects non-array responsibilities", () => {
      expect(() =>
        validatePersona(makePersona({ responsibilities: "fix tests" } as unknown as Persona)),
      ).toThrowError(ContractValidationError);
    });

    it("rejects an empty workingApproach", () => {
      expect(() =>
        validatePersona(makePersona({ workingApproach: "" })),
      ).toThrowError(ContractValidationError);
    });

    it("rejects missing constraints", () => {
      const p = makePersona() as unknown as Record<string, unknown>;
      delete p.constraints;
      expect(() => validatePersona(p)).toThrowError(ContractValidationError);
    });

    it("rejects missing applicability", () => {
      const p = makePersona() as unknown as Record<string, unknown>;
      delete p.applicability;
      expect(() => validatePersona(p)).toThrowError(ContractValidationError);
    });

    it("accepts optional evaluationRefs", () => {
      expect(() =>
        validatePersona(makePersona({ evaluationRefs: ["ev-1", "ev-2"] })),
      ).not.toThrow();
    });

    it("rejects non-string evaluationRefs", () => {
      expect(() =>
        validatePersona(makePersona({ evaluationRefs: ["ev-1", 2] as unknown as string[] })),
      ).toThrowError(ContractValidationError);
    });
  });

  describe("isPersonaApproved", () => {
    it("returns true when provenance kind is approved", () => {
      expect(isPersonaApproved(makePersona())).toBe(true);
    });

    it("returns false when provenance kind is observed", () => {
      expect(
        isPersonaApproved(
          makePersona({
            provenance: { kind: "observed", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(false);
    });
  });

  describe("isPersonaDeprecated", () => {
    it("returns true when provenance kind is deprecated", () => {
      expect(
        isPersonaDeprecated(
          makePersona({
            provenance: { kind: "deprecated", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(true);
    });

    it("returns false when provenance kind is approved", () => {
      expect(isPersonaDeprecated(makePersona())).toBe(false);
    });
  });
});
