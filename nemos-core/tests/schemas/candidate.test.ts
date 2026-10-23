/**
 * Stage F — CandidateRecord schema tests.
 *
 * Verifies:
 *   C1: validateCandidateRecord accepts a valid record.
 *   C2: rejects invalid assetKind.
 *   C3: rejects invalid changeKind.
 *   C4: rejects invalid status.
 *   C5: rejects missing required fields.
 *   C6: rejects malformed content.
 *   C7: rejects empty rationale.
 *   C8: rejects empty proposedBy.
 *   C9: isCandidateApproved checks status.
 *   C10: isCandidateUnderReview checks status.
 *   C11: isCandidateTerminal returns true only for superseded.
 *   C12: isCandidateTransitionAllowed covers all 5 statuses.
 *   C13: IllegalCandidateTransitionError carries from + to + code.
 */

import { describe, it, expect } from "vitest";
import {
  validateCandidateRecord,
  isCandidateApproved,
  isCandidateUnderReview,
  isCandidateTerminal,
  isCandidateTransitionAllowed,
  IllegalCandidateTransitionError,
  legalNextCandidateStatuses,
} from "../../src/schemas/candidate.js";
import type { CandidateRecord } from "../../src/schemas/candidate.js";
import { asCandidateId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makeCandidate(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    id: asCandidateId("cand-1"),
    assetKind: "skill",
    assetId: "skill-run-tests",
    proposedVersion: "1.1.0",
    changeKind: "update",
    content: { name: "run-tests", description: "Updated description" },
    provenance: {
      kind: "observed",
      source: { kind: "human", actor: "proposer", at: "2024-01-01T00:00:00Z" },
    },
    status: "proposed",
    proposedBy: "alice",
    proposedAt: "2024-01-01T00:00:00Z",
    rationale: "Update the description for clarity.",
    reviewTrail: [],
    ...overrides,
  };
}

describe("Stage F — CandidateRecord schema", () => {
  describe("C1: validate accepts a valid record", () => {
    it("does not throw for a valid candidate", () => {
      expect(() => validateCandidateRecord(makeCandidate())).not.toThrow();
    });

    it("accepts a candidate with supersedesCandidateId", () => {
      expect(() =>
        validateCandidateRecord(
          makeCandidate({ supersedesCandidateId: asCandidateId("cand-prev") }),
        ),
      ).not.toThrow();
    });

    it("accepts a candidate with evidenceRefs", () => {
      expect(() =>
        validateCandidateRecord(
          makeCandidate({ evidenceRefs: ["ev-1", "ev-2"] }),
        ),
      ).not.toThrow();
    });
  });

  describe("C2 + C3 + C4: rejects invalid enum values", () => {
    it("C2: rejects an invalid assetKind", () => {
      const bad = makeCandidate() as unknown as Record<string, unknown>;
      bad.assetKind = "invalid-kind";
      expect(() => validateCandidateRecord(bad)).toThrowError(ContractValidationError);
    });

    it("C3: rejects an invalid changeKind", () => {
      const bad = makeCandidate() as unknown as Record<string, unknown>;
      bad.changeKind = "invalid-change";
      expect(() => validateCandidateRecord(bad)).toThrowError(ContractValidationError);
    });

    it("C4: rejects an invalid status", () => {
      const bad = makeCandidate() as unknown as Record<string, unknown>;
      bad.status = "invalid-status";
      expect(() => validateCandidateRecord(bad)).toThrowError(ContractValidationError);
    });
  });

  describe("C5 + C6 + C7 + C8: rejects missing required fields", () => {
    it("C5: rejects missing id", () => {
      const bad = makeCandidate() as unknown as Record<string, unknown>;
      delete bad.id;
      expect(() => validateCandidateRecord(bad)).toThrowError(ContractValidationError);
    });

    it("C6: rejects non-object content", () => {
      const bad = makeCandidate() as unknown as Record<string, unknown>;
      bad.content = "not-an-object";
      expect(() => validateCandidateRecord(bad)).toThrowError(ContractValidationError);
    });

    it("C7: rejects empty rationale", () => {
      expect(() =>
        validateCandidateRecord(makeCandidate({ rationale: "" })),
      ).toThrowError(ContractValidationError);
    });

    it("C8: rejects empty proposedBy", () => {
      expect(() =>
        validateCandidateRecord(makeCandidate({ proposedBy: "" })),
      ).toThrowError(ContractValidationError);
    });

    it("rejects missing provenance", () => {
      const bad = makeCandidate() as unknown as Record<string, unknown>;
      delete bad.provenance;
      expect(() => validateCandidateRecord(bad)).toThrowError(ContractValidationError);
    });

    it("rejects non-array reviewTrail", () => {
      const bad = makeCandidate() as unknown as Record<string, unknown>;
      bad.reviewTrail = "not-an-array";
      expect(() => validateCandidateRecord(bad)).toThrowError(ContractValidationError);
    });
  });

  describe("C9 + C10 + C11: status helpers", () => {
    it("C9: isCandidateApproved returns true only for status='approved'", () => {
      expect(isCandidateApproved(makeCandidate({ status: "approved" }))).toBe(true);
      expect(isCandidateApproved(makeCandidate({ status: "proposed" }))).toBe(false);
      expect(isCandidateApproved(makeCandidate({ status: "under_review" }))).toBe(false);
    });

    it("C10: isCandidateUnderReview returns true only for status='under_review'", () => {
      expect(isCandidateUnderReview(makeCandidate({ status: "under_review" }))).toBe(true);
      expect(isCandidateUnderReview(makeCandidate({ status: "approved" }))).toBe(false);
    });

    it("C11: isCandidateTerminal returns true only for status='superseded'", () => {
      expect(isCandidateTerminal(makeCandidate({ status: "superseded" }))).toBe(true);
      expect(isCandidateTerminal(makeCandidate({ status: "approved" }))).toBe(false);
      expect(isCandidateTerminal(makeCandidate({ status: "rejected" }))).toBe(false);
    });
  });

  describe("C12 + C13: transitions", () => {
    it("C12: isCandidateTransitionAllowed covers every (from, to) pair", () => {
      const statuses: CandidateRecord["status"][] = [
        "proposed",
        "under_review",
        "approved",
        "rejected",
        "superseded",
      ];
      for (const from of statuses) {
        for (const to of statuses) {
          // Must not throw and must return a boolean
          expect(() => isCandidateTransitionAllowed(from, to)).not.toThrow();
          expect(typeof isCandidateTransitionAllowed(from, to)).toBe("boolean");
          // Self-transitions are forbidden
          if (from === to) {
            expect(isCandidateTransitionAllowed(from, to)).toBe(false);
          }
        }
      }
    });

    it("C12: proposed → under_review is allowed", () => {
      expect(isCandidateTransitionAllowed("proposed", "under_review")).toBe(true);
    });

    it("C12: under_review → approved is allowed", () => {
      expect(isCandidateTransitionAllowed("under_review", "approved")).toBe(true);
    });

    it("C12: approved → superseded is allowed (forward)", () => {
      expect(isCandidateTransitionAllowed("approved", "superseded")).toBe(true);
    });

    it("C12: approved → under_review is allowed (rollback)", () => {
      expect(isCandidateTransitionAllowed("approved", "under_review")).toBe(true);
    });

    it("C12: superseded → anything is forbidden (terminal)", () => {
      const statuses: CandidateRecord["status"][] = [
        "proposed",
        "under_review",
        "approved",
        "rejected",
        "superseded",
      ];
      for (const to of statuses) {
        expect(isCandidateTransitionAllowed("superseded", to)).toBe(false);
      }
    });

    it("C12: proposed → approved is forbidden (must go through under_review)", () => {
      expect(isCandidateTransitionAllowed("proposed", "approved")).toBe(false);
    });

    it("C13: IllegalCandidateTransitionError carries from + to + code", () => {
      const e = new IllegalCandidateTransitionError("proposed", "approved");
      expect(e.from).toBe("proposed");
      expect(e.to).toBe("approved");
      expect(e.code).toBe("NEMONS_CANDIDATE_ILLEGAL_TRANSITION");
      expect(e.message).toContain("proposed");
      expect(e.message).toContain("approved");
    });
  });

  describe("legalNextCandidateStatuses", () => {
    it("returns the legal next statuses from 'proposed'", () => {
      expect(legalNextCandidateStatuses("proposed")).toEqual(["under_review", "rejected"]);
    });

    it("returns the legal next statuses from 'under_review'", () => {
      expect(legalNextCandidateStatuses("under_review")).toEqual(["approved", "rejected", "proposed"]);
    });

    it("returns the legal next statuses from 'approved'", () => {
      // approved → superseded OR under_review (rollback)
      const next = legalNextCandidateStatuses("approved");
      expect(next).toContain("superseded");
      expect(next).toContain("under_review");
    });

    it("returns [] from 'superseded' (terminal)", () => {
      expect(legalNextCandidateStatuses("superseded")).toEqual([]);
    });
  });
});
