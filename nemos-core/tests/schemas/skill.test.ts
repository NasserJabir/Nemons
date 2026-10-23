import { describe, it, expect } from "vitest";
import {
  validateSkill,
  isSkillApproved,
  isSkillCandidate,
  isSkillDeprecated,
  isSkillMissingRequiredCapability,
} from "../../src/schemas/skill.js";
import type { Skill } from "../../src/schemas/skill.js";
import { asSkillId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: asSkillId("s-1"),
    version: "1.0.0",
    provenance: {
      kind: "approved",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    name: "run-tests",
    description: "Runs the test suite and reports failures.",
    applicability: { taskKinds: ["test-fix"] },
    inputs: [{ name: "filter", type: "string", required: false }],
    outputs: [{ name: "report", type: "object" }],
    requiredCapabilities: [{ capability: "tool.shell.exec", required: true }],
    ...overrides,
  };
}

describe("skill schema", () => {
  describe("validateSkill", () => {
    it("accepts a valid Skill", () => {
      expect(() => validateSkill(makeSkill())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateSkill(null)).toThrowError(ContractValidationError);
    });

    it("rejects empty id", () => {
      expect(() => validateSkill(makeSkill({ id: asSkillId("") }))).toThrowError(ContractValidationError);
    });

    it("rejects empty name", () => {
      expect(() => validateSkill(makeSkill({ name: "" }))).toThrowError(ContractValidationError);
    });

    it("rejects non-array inputs", () => {
      expect(() =>
        validateSkill(makeSkill({ inputs: "wrong" as unknown as Skill["inputs"] })),
      ).toThrowError(ContractValidationError);
    });

    it("rejects non-array outputs", () => {
      expect(() =>
        validateSkill(makeSkill({ outputs: "wrong" as unknown as Skill["outputs"] })),
      ).toThrowError(ContractValidationError);
    });

    it("rejects non-array requiredCapabilities", () => {
      expect(() =>
        validateSkill(makeSkill({ requiredCapabilities: "wrong" as unknown as Skill["requiredCapabilities"] })),
      ).toThrowError(ContractValidationError);
    });
  });

  describe("isSkillApproved", () => {
    it("returns true for approved kind", () => {
      expect(isSkillApproved(makeSkill())).toBe(true);
    });

    it("returns false for proposed kind", () => {
      expect(
        isSkillApproved(
          makeSkill({
            provenance: { kind: "proposed", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(false);
    });
  });

  describe("isSkillCandidate", () => {
    it("returns true for proposed kind", () => {
      expect(
        isSkillCandidate(
          makeSkill({
            provenance: { kind: "proposed", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(true);
    });

    it("returns true for observed kind", () => {
      expect(
        isSkillCandidate(
          makeSkill({
            provenance: { kind: "observed", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(true);
    });

    it("returns false for approved kind", () => {
      expect(isSkillCandidate(makeSkill())).toBe(false);
    });
  });

  describe("isSkillDeprecated", () => {
    it("returns true for deprecated kind", () => {
      expect(
        isSkillDeprecated(
          makeSkill({
            provenance: { kind: "deprecated", source: { kind: "human", actor: "x", at: "x" } },
          }),
        ),
      ).toBe(true);
    });
  });

  describe("isSkillMissingRequiredCapability", () => {
    it("returns false when all required capabilities are available", () => {
      const s = makeSkill({
        requiredCapabilities: [
          { capability: "tool.shell.exec", required: true },
          { capability: "tool.file.read", required: true },
        ],
      });
      const available = new Set(["tool.shell.exec", "tool.file.read"]);
      expect(isSkillMissingRequiredCapability(s, available)).toBe(false);
    });

    it("returns true when a required capability is missing", () => {
      const s = makeSkill({
        requiredCapabilities: [
          { capability: "tool.shell.exec", required: true },
          { capability: "tool.git.push", required: true },
        ],
      });
      const available = new Set(["tool.shell.exec"]);
      expect(isSkillMissingRequiredCapability(s, available)).toBe(true);
    });

    it("returns false when a required capability is satisfied via fallback", () => {
      const s = makeSkill({
        requiredCapabilities: [
          {
            capability: "tool.git.push",
            required: true,
            fallbackCapability: "tool.git.push_force",
          },
        ],
      });
      const available = new Set(["tool.git.push_force"]);
      expect(isSkillMissingRequiredCapability(s, available)).toBe(false);
    });

    it("returns false when a capability is not required", () => {
      const s = makeSkill({
        requiredCapabilities: [
          { capability: "tool.git.push", required: false },
        ],
      });
      const available = new Set<string>();
      expect(isSkillMissingRequiredCapability(s, available)).toBe(false);
    });
  });
});
