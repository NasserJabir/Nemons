import { describe, it, expect } from "vitest";
import {
  validateEvidence,
  isEvidenceKindSufficientForSuccess,
  computeInlinePayloadHash,
  verifyInlineEvidence,
} from "../../src/schemas/evidence.js";
import type { Evidence } from "../../src/schemas/evidence.js";
import { asEvidenceId, asRunId, sha256Hex } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: asEvidenceId("e-1"),
    runId: asRunId("r-1"),
    kind: "test_result",
    claim: "tests passed",
    artifact: {
      inlinePayload: '{"passed":true}',
      contentHash: sha256Hex('{"passed":true}'),
      contentType: "application/json",
      bytes: 15,
    },
    provenance: {
      kind: "observed",
      source: { kind: "run", runId: asRunId("r-1"), at: "2024-01-01T00:00:00Z" },
    },
    recordedAt: "2024-01-01T00:00:00Z",
    verified: false,
    ...overrides,
  };
}

describe("evidence schema", () => {
  describe("validateEvidence", () => {
    it("accepts a valid Evidence record", () => {
      expect(() => validateEvidence(makeEvidence())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateEvidence(null)).toThrowError(ContractValidationError);
    });

    it("rejects an invalid kind", () => {
      const e = makeEvidence() as unknown as Record<string, unknown>;
      e.kind = "invalid-kind";
      expect(() => validateEvidence(e)).toThrowError(ContractValidationError);
    });

    it("rejects an empty claim", () => {
      expect(() => validateEvidence(makeEvidence({ claim: "" }))).toThrowError(ContractValidationError);
    });

    it("rejects an artifact with neither uri nor inlinePayload", () => {
      const e = makeEvidence({
        artifact: { contentHash: "x" },
      });
      expect(() => validateEvidence(e)).toThrowError(ContractValidationError);
    });

    it("rejects an artifact with empty contentHash", () => {
      const e = makeEvidence({
        artifact: { inlinePayload: "x", contentHash: "" },
      });
      expect(() => validateEvidence(e)).toThrowError(ContractValidationError);
    });

    it("rejects a non-boolean verified", () => {
      const e = makeEvidence() as unknown as Record<string, unknown>;
      e.verified = "yes";
      expect(() => validateEvidence(e)).toThrowError(ContractValidationError);
    });
  });

  describe("isEvidenceKindSufficientForSuccess", () => {
    it("returns true for test_result", () => {
      expect(isEvidenceKindSufficientForSuccess("test_result")).toBe(true);
    });

    it("returns true for verification_report", () => {
      expect(isEvidenceKindSufficientForSuccess("verification_report")).toBe(true);
    });

    it("returns true for build_output", () => {
      expect(isEvidenceKindSufficientForSuccess("build_output")).toBe(true);
    });

    it("returns FALSE for text_assertion", () => {
      expect(isEvidenceKindSufficientForSuccess("text_assertion")).toBe(false);
    });
  });

  describe("computeInlinePayloadHash", () => {
    it("matches sha256Hex for the same input", () => {
      expect(computeInlinePayloadHash("hello")).toBe(sha256Hex("hello"));
    });
  });

  describe("verifyInlineEvidence", () => {
    it("returns true when the payload hashes to the recorded contentHash", () => {
      const e = makeEvidence();
      expect(verifyInlineEvidence(e)).toBe(true);
    });

    it("returns false when the payload does NOT hash to the recorded contentHash", () => {
      const e = makeEvidence({
        artifact: { inlinePayload: '{"passed":true}', contentHash: "wrong" },
      });
      expect(verifyInlineEvidence(e)).toBe(false);
    });

    it("returns false when inlinePayload is missing (URI-backed)", () => {
      const e = makeEvidence({
        artifact: { uri: "file://x", contentHash: "x" },
      });
      expect(verifyInlineEvidence(e)).toBe(false);
    });
  });
});
