import { describe, it, expect } from "vitest";
import {
  validateContextPack,
  contextPackRespectsConstraints,
  candidateAssetsInContextPack,
} from "../../src/schemas/context-pack.js";
import type { ContextPack } from "../../src/schemas/context-pack.js";
import { asContextPackId, asRunId, asPersonaId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

function makePack(overrides: Partial<ContextPack> = {}): ContextPack {
  return {
    id: asContextPackId("cp-1"),
    runId: asRunId("r-1"),
    assets: [
      {
        assetKind: "persona",
        assetId: asPersonaId("p-1"),
        version: "1.0.0",
        provenanceKind: "approved",
        selectionReason: "task-kind match",
      },
    ],
    exclusions: [],
    constraints: { maxAssets: 10, maxContentBytes: 10_000 },
    actualBytes: 256,
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("context-pack schema", () => {
  describe("validateContextPack", () => {
    it("accepts a valid Context Pack", () => {
      expect(() => validateContextPack(makePack())).not.toThrow();
    });

    it("rejects null", () => {
      expect(() => validateContextPack(null)).toThrowError(ContractValidationError);
    });

    it("rejects an empty id", () => {
      expect(() =>
        validateContextPack(makePack({ id: asContextPackId("") })),
      ).toThrowError(ContractValidationError);
    });

    it("rejects an empty runId", () => {
      expect(() => validateContextPack(makePack({ runId: asRunId("") }))).toThrowError(ContractValidationError);
    });

    it("rejects non-array assets", () => {
      const p = makePack() as unknown as Record<string, unknown>;
      p.assets = "wrong";
      expect(() => validateContextPack(p)).toThrowError(ContractValidationError);
    });

    it("rejects an asset with invalid assetKind", () => {
      const p = makePack({
        assets: [
          {
            assetKind: "invalid" as never,
            assetId: "x",
            version: "1",
            provenanceKind: "approved",
            selectionReason: "x",
          },
        ],
      });
      expect(() => validateContextPack(p)).toThrowError(ContractValidationError);
    });

    it("rejects an asset with empty selectionReason", () => {
      const p = makePack({
        assets: [
          {
            assetKind: "persona",
            assetId: "p",
            version: "1",
            provenanceKind: "approved",
            selectionReason: "",
          },
        ],
      });
      expect(() => validateContextPack(p)).toThrowError(ContractValidationError);
    });

    it("rejects negative maxAssets", () => {
      const p = makePack({
        constraints: { maxAssets: -1, maxContentBytes: 100 },
      });
      expect(() => validateContextPack(p)).toThrowError(ContractValidationError);
    });

    it("rejects negative maxContentBytes", () => {
      const p = makePack({
        constraints: { maxAssets: 10, maxContentBytes: -1 },
      });
      expect(() => validateContextPack(p)).toThrowError(ContractValidationError);
    });

    it("rejects negative actualBytes", () => {
      expect(() => validateContextPack(makePack({ actualBytes: -1 }))).toThrowError(ContractValidationError);
    });
  });

  describe("contextPackRespectsConstraints", () => {
    it("returns true when assets and bytes are within bounds", () => {
      expect(contextPackRespectsConstraints(makePack())).toBe(true);
    });

    it("returns false when assets exceed maxAssets", () => {
      const p = makePack({
        assets: [
          {
            assetKind: "persona",
            assetId: "p1",
            version: "1",
            provenanceKind: "approved",
            selectionReason: "x",
          },
          {
            assetKind: "persona",
            assetId: "p2",
            version: "1",
            provenanceKind: "approved",
            selectionReason: "x",
          },
        ],
        constraints: { maxAssets: 1, maxContentBytes: 10_000 },
      });
      expect(contextPackRespectsConstraints(p)).toBe(false);
    });

    it("returns false when actualBytes exceeds maxContentBytes", () => {
      const p = makePack({ actualBytes: 20_000 });
      expect(contextPackRespectsConstraints(p)).toBe(false);
    });
  });

  describe("candidateAssetsInContextPack", () => {
    it("returns empty when all assets are approved", () => {
      expect(candidateAssetsInContextPack(makePack())).toEqual([]);
    });

    it("returns the non-approved assets", () => {
      const p = makePack({
        assets: [
          {
            assetKind: "persona",
            assetId: "p-approved",
            version: "1",
            provenanceKind: "approved",
            selectionReason: "x",
          },
          {
            assetKind: "skill",
            assetId: "s-candidate",
            version: "1",
            provenanceKind: "proposed",
            selectionReason: "x",
          },
          {
            assetKind: "knowledge",
            assetId: "k-observed",
            version: "1",
            provenanceKind: "observed",
            selectionReason: "x",
          },
        ],
      });
      const candidates = candidateAssetsInContextPack(p);
      expect(candidates).toHaveLength(2);
      expect(candidates.map((c) => c.assetId)).toEqual(["s-candidate", "k-observed"]);
    });
  });
});
