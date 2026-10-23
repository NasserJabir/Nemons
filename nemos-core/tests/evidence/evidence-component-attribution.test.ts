/**
 * Evidence-to-Component Attribution tests (ADR-0012 — from HERMES research).
 *
 * Verifies:
 *   AC1: Evidence without attributedComponent is valid (backward-compatible).
 *   AC2: Evidence WITH attributedComponent is valid.
 *   AC3: all 6 componentKinds are supported.
 *   AC4: attributedComponent includes componentId + componentVersion + relationship.
 *   AC5: the attribution links Evidence to a specific Skill (full chain with ADR-0010).
 *   AC6: validateEvidence accepts attributedComponent when present.
 *   AC7: "none" componentKind is valid for environment-level Evidence.
 *   AC8: existing tests pass unchanged (no attributedComponent).
 */

import { describe, it, expect } from "vitest";
import {
  validateEvidence,
  isEvidenceKindSufficientForSuccess,
} from "../../src/schemas/evidence.js";
import type { Evidence, AttributedComponent } from "../../src/schemas/evidence.js";
import { ContractValidationError } from "../../src/core/errors.js";
import {
  asEvidenceId,
  asRunId,
  sha256Hex,
} from "../../src/core/identifiers.js";

function makeAttribution(
  overrides: Partial<AttributedComponent> = {},
): AttributedComponent {
  return {
    componentKind: "skill",
    componentId: "skill-run-tests",
    componentVersion: "1.0.0",
    relationship: "produced by",
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: asEvidenceId("ev-ac-1"),
    runId: asRunId("r-ac-1"),
    kind: "test_result",
    claim: "tests pass",
    artifact: {
      inlinePayload: '{"passing":true}',
      contentHash: sha256Hex('{"passing":true}'),
      contentType: "application/json",
      bytes: 16,
    },
    provenance: {
      kind: "observed",
      source: { kind: "run", runId: asRunId("r-ac-1"), at: "2024-01-01T00:00:00Z" },
    },
    recordedAt: "2024-01-01T00:00:00Z",
    verified: true,
    ...overrides,
  };
}

describe("Evidence-to-Component Attribution (ADR-0012 — HERMES)", () => {
  describe("AC1 + AC8: backward compatibility", () => {
    it("AC1: Evidence without attributedComponent is valid", () => {
      const ev = makeEvidence(); // no attributedComponent
      expect(() => validateEvidence(ev)).not.toThrow();
    });

    it("AC8: existing Evidence (no attribution) passes validation", () => {
      const ev = makeEvidence();
      expect(ev.attributedComponent).toBeUndefined();
      expect(() => validateEvidence(ev)).not.toThrow();
    });
  });

  describe("AC2 + AC6: Evidence WITH attributedComponent", () => {
    it("AC2: Evidence with attributedComponent is valid", () => {
      const ev = makeEvidence({
        attributedComponent: makeAttribution(),
      });
      expect(() => validateEvidence(ev)).not.toThrow();
      expect(ev.attributedComponent).toBeDefined();
    });

    it("AC6: validateEvidence accepts attributedComponent", () => {
      const ev = makeEvidence({
        attributedComponent: makeAttribution({
          componentKind: "tool",
          componentId: "tool-git-diff",
          componentVersion: "git-2.43",
          relationship: "failed due to",
        }),
      });
      expect(() => validateEvidence(ev)).not.toThrow();
    });
  });

  describe("AC3: all 6 componentKinds", () => {
    const kinds: AttributedComponent["componentKind"][] = [
      "skill",
      "knowledge",
      "tool",
      "persona",
      "memory",
      "none",
    ];

    for (const kind of kinds) {
      it(`supports componentKind: ${kind}`, () => {
        const ev = makeEvidence({
          attributedComponent: makeAttribution({ componentKind: kind }),
        });
        expect(() => validateEvidence(ev)).not.toThrow();
        expect(ev.attributedComponent?.componentKind).toBe(kind);
      });
    }
  });

  describe("AC4: attributedComponent fields", () => {
    it("includes componentId + componentVersion + relationship", () => {
      const ev = makeEvidence({
        attributedComponent: makeAttribution({
          componentKind: "skill",
          componentId: "skill-fix-test",
          componentVersion: "2.1.0",
          relationship: "verified against",
        }),
      });
      expect(ev.attributedComponent?.componentId).toBe("skill-fix-test");
      expect(ev.attributedComponent?.componentVersion).toBe("2.1.0");
      expect(ev.attributedComponent?.relationship).toBe("verified against");
    });

    it("componentId and componentVersion are optional", () => {
      const ev = makeEvidence({
        attributedComponent: {
          componentKind: "none",
          relationship: "environment-level evidence",
        },
      });
      expect(ev.attributedComponent?.componentId).toBeUndefined();
      expect(ev.attributedComponent?.componentVersion).toBeUndefined();
      expect(() => validateEvidence(ev)).not.toThrow();
    });
  });

  describe("AC5: full attribution chain (ADR-0010 + ADR-0012)", () => {
    it("links Evidence to a specific Skill, completing the attribution chain", () => {
      // ADR-0010: Run fails with failureAttribution.category = "skill"
      // ADR-0012: Evidence links to the specific Skill
      const ev = makeEvidence({
        kind: "test_result",
        claim: "tests failed — skill produced wrong command",
        verified: true,
        attributedComponent: makeAttribution({
          componentKind: "skill",
          componentId: "skill-run-tests",
          componentVersion: "1.0.0",
          relationship: "failed due to",
        }),
      });

      // The Evidence is attributed to skill-run-tests v1.0.0
      expect(ev.attributedComponent?.componentKind).toBe("skill");
      expect(ev.attributedComponent?.componentId).toBe("skill-run-tests");
      expect(ev.attributedComponent?.componentVersion).toBe("1.0.0");
      expect(ev.attributedComponent?.relationship).toBe("failed due to");

      // Offline refinement can now target skill-run-tests v1.0.0
      // for improvement — the attribution chain is complete:
      //   Run failed → category: "skill" (ADR-0010)
      //   Evidence → component: skill-run-tests v1.0.0 (ADR-0012)
      //   Action: refine skill-run-tests → generate Candidate → governed review
    });

    it("links Evidence to a Knowledge item", () => {
      const ev = makeEvidence({
        attributedComponent: makeAttribution({
          componentKind: "knowledge",
          componentId: "knowledge-test-runner-config",
          componentVersion: "1.0.0",
          relationship: "based on outdated knowledge",
        }),
      });
      expect(ev.attributedComponent?.componentKind).toBe("knowledge");
      expect(ev.attributedComponent?.componentId).toBe("knowledge-test-runner-config");
    });

    it("links Evidence to a Tool", () => {
      const ev = makeEvidence({
        attributedComponent: makeAttribution({
          componentKind: "tool",
          componentId: "tool-shell-exec",
          componentVersion: "bash-5.1",
          relationship: "tool returned error",
        }),
      });
      expect(ev.attributedComponent?.componentKind).toBe("tool");
    });
  });

  describe("AC7: 'none' componentKind for environment-level Evidence", () => {
    it("environment-level Evidence with componentKind='none' is valid", () => {
      const ev = makeEvidence({
        kind: "validation_output",
        claim: "filesystem was full",
        attributedComponent: {
          componentKind: "none",
          relationship: "environment-level failure",
        },
      });
      expect(ev.attributedComponent?.componentKind).toBe("none");
      expect(ev.attributedComponent?.componentId).toBeUndefined();
      expect(() => validateEvidence(ev)).not.toThrow();
    });
  });

  describe("AC9: multiple Evidence records with different attributions", () => {
    it("a Run can have Evidence attributed to different components", () => {
      const ev1 = makeEvidence({
        id: asEvidenceId("ev-skill"),
        attributedComponent: makeAttribution({
          componentKind: "skill",
          componentId: "skill-run-tests",
          relationship: "produced by",
        }),
      });
      const ev2 = makeEvidence({
        id: asEvidenceId("ev-tool"),
        attributedComponent: makeAttribution({
          componentKind: "tool",
          componentId: "tool-git-commit",
          relationship: "failed due to",
        }),
      });
      const ev3 = makeEvidence({
        id: asEvidenceId("ev-env"),
        attributedComponent: {
          componentKind: "none",
          relationship: "environment-level",
        },
      });

      // All three are valid with different attributions
      expect(() => validateEvidence(ev1)).not.toThrow();
      expect(() => validateEvidence(ev2)).not.toThrow();
      expect(() => validateEvidence(ev3)).not.toThrow();

      // Different components
      expect(ev1.attributedComponent?.componentKind).toBe("skill");
      expect(ev2.attributedComponent?.componentKind).toBe("tool");
      expect(ev3.attributedComponent?.componentKind).toBe("none");
    });
  });
});
