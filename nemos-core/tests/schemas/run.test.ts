import { describe, it, expect } from "vitest";
import {
  validateRun,
  isRunTerminal,
  isRunVerifiedSucceeded,
} from "../../src/schemas/run.js";
import type { Run } from "../../src/schemas/run.js";
import { asRunId, asContextPackId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: asRunId("r-1"),
    state: "pending",
    inputs: {
      taskDescription: "Fix the failing test.",
      taskKind: "test-fix",
      taskTags: ["vitest"],
      repoInstance: {
        repoIdentity: { repo: "https://example.com/repo.git", sha: "abc123" },
        instanceId: "inst-1",
      },
    },
    contextPackId: asContextPackId("cp-1"),
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "tester", at: "2024-01-01T00:00:00Z" },
    },
    ...overrides,
  };
}

describe("run schema", () => {
  describe("validateRun", () => {
    it("accepts a valid Run", () => {
      expect(() => validateRun(makeRun())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateRun(null)).toThrowError(ContractValidationError);
    });

    it("rejects an invalid state", () => {
      const r = makeRun() as unknown as Record<string, unknown>;
      r.state = "weird";
      expect(() => validateRun(r)).toThrowError(ContractValidationError);
    });

    it("rejects an invalid taskKind", () => {
      const r = makeRun() as unknown as Record<string, unknown>;
      (r.inputs as Record<string, unknown>).taskKind = "invalid";
      expect(() => validateRun(r)).toThrowError(ContractValidationError);
    });

    it("rejects an empty taskDescription", () => {
      const r = makeRun({
        inputs: {
          taskDescription: "",
          taskKind: "test-fix",
          repoInstance: {
            repoIdentity: { repo: "x", sha: "y" },
            instanceId: "i",
          },
        },
      });
      expect(() => validateRun(r)).toThrowError(ContractValidationError);
    });

    it("rejects an empty contextPackId", () => {
      expect(() => validateRun(makeRun({ contextPackId: asContextPackId("") }))).toThrowError(ContractValidationError);
    });
  });

  describe("isRunTerminal", () => {
    it("returns false for pending", () => {
      expect(isRunTerminal(makeRun({ state: "pending" }))).toBe(false);
    });

    it("returns false for in_progress", () => {
      expect(isRunTerminal(makeRun({ state: "in_progress" }))).toBe(false);
    });

    it("returns true for succeeded", () => {
      expect(isRunTerminal(makeRun({ state: "succeeded" }))).toBe(true);
    });

    it("returns true for failed", () => {
      expect(isRunTerminal(makeRun({ state: "failed" }))).toBe(true);
    });

    it("returns true for aborted", () => {
      expect(isRunTerminal(makeRun({ state: "aborted" }))).toBe(true);
    });
  });

  describe("isRunVerifiedSucceeded", () => {
    it("returns false for a succeeded Run with NO evidence (contract violation)", () => {
      const r = makeRun({ state: "succeeded" });
      expect(isRunVerifiedSucceeded(r)).toBe(false);
    });

    it("returns true for a succeeded Run WITH evidence", () => {
      const r = makeRun({ state: "succeeded", evidenceRefs: ["ev-1"] });
      expect(isRunVerifiedSucceeded(r)).toBe(true);
    });

    it("returns false for a non-succeeded Run", () => {
      const r = makeRun({ state: "in_progress", evidenceRefs: ["ev-1"] });
      expect(isRunVerifiedSucceeded(r)).toBe(false);
    });
  });
});
