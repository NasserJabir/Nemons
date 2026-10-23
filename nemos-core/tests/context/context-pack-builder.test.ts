import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultContextPackBuilder,
} from "../../src/context/context-pack-builder.js";
import {
  InMemoryPolicyRuleRegistry,
} from "../../src/policy/policy-contracts.js";
import { DefaultPolicyEngine } from "../../src/policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "../../src/policy/builtin-rules.js";
import type { ContextResolutionResult } from "../../src/context/context-resolver.js";
import { asRunId, asPersonaId, asSkillId, asKnowledgeId, asMemoryRecordId } from "../../src/core/identifiers.js";
import { ContractValidationError } from "../../src/core/errors.js";

describe("context-pack-builder", () => {
  let registry: InMemoryPolicyRuleRegistry;
  let engine: DefaultPolicyEngine;
  let builder: DefaultContextPackBuilder;

  beforeEach(() => {
    registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) registry.register(rule);
    engine = new DefaultPolicyEngine(registry);
    builder = new DefaultContextPackBuilder(engine, {
      maxAssets: 10,
      maxContentBytes: 10_000,
    });
  });

  function makeResolutionApproved(): ContextResolutionResult {
    return {
      personas: [
        {
          asset: {
            id: asPersonaId("p-1"),
            version: "1.0.0",
            provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
            role: "x",
            responsibilities: [],
            workingApproach: "x",
            constraints: {},
            applicability: {},
          },
          included: true,
          reason: "applicable",
        },
      ],
      skills: [],
      knowledge: [],
      memory: [],
      resolvedAt: "2024-01-01T00:00:00Z",
    };
  }

  it("builds a valid Context Pack from approved candidates", () => {
    const pack = builder.build({
      runId: asRunId("r-1"),
      resolution: makeResolutionApproved(),
    });
    expect(pack.assets).toHaveLength(1);
    expect(pack.assets[0]?.assetKind).toBe("persona");
    expect(pack.assets[0]?.provenanceKind).toBe("approved");
    expect(pack.exclusions).toHaveLength(0);
  });

  it("EXCLUDES candidate (non-approved) assets in non-experimental runs", () => {
    const resolution = makeResolutionApproved();
    resolution.personas[0] = {
      asset: {
        ...resolution.personas[0]!.asset,
        id: asPersonaId("p-candidate"),
        provenance: { kind: "proposed", source: { kind: "human", actor: "x", at: "x" } },
      },
      included: true,
      reason: "applicable",
    };
    const pack = builder.build({
      runId: asRunId("r-1"),
      resolution,
    });
    expect(pack.assets).toHaveLength(0);
    expect(pack.exclusions).toHaveLength(1);
    expect(pack.exclusions[0]?.reasonKind).toBe("policy");
  });

  it("INCLUDES candidate assets in explicitly experimental runs", () => {
    const resolution = makeResolutionApproved();
    resolution.personas[0] = {
      asset: {
        ...resolution.personas[0]!.asset,
        id: asPersonaId("p-candidate"),
        provenance: { kind: "proposed", source: { kind: "human", actor: "x", at: "x" } },
      },
      included: true,
      reason: "applicable",
    };
    const pack = builder.build({
      runId: asRunId("r-1"),
      resolution,
      experimentalRun: true,
    });
    expect(pack.assets).toHaveLength(1);
    expect(pack.assets[0]?.provenanceKind).toBe("proposed");
  });

  it("propagates resolver-level exclusions into the pack", () => {
    const resolution: ContextResolutionResult = {
      personas: [],
      skills: [],
      knowledge: [
        {
          asset: {
            id: asKnowledgeId("k-deprecated"),
            version: "1",
            provenance: { kind: "deprecated", source: { kind: "human", actor: "x", at: "x" } },
            title: "x",
            summary: "x",
            content: "x",
            applicability: { subjectKind: "repository" },
          },
          included: false,
          reason: "Knowledge is deprecated.",
          exclusionReasonKind: "lifecycle",
        },
      ],
      memory: [],
      resolvedAt: "2024-01-01T00:00:00Z",
    };
    const pack = builder.build({
      runId: asRunId("r-1"),
      resolution,
    });
    expect(pack.assets).toHaveLength(0);
    expect(pack.exclusions).toHaveLength(1);
    expect(pack.exclusions[0]?.assetKind).toBe("knowledge");
  });

  it("enforces maxAssets constraint by trimming excess", () => {
    const builderTight = new DefaultContextPackBuilder(engine, {
      maxAssets: 1,
      maxContentBytes: 10_000,
    });
    const resolution: ContextResolutionResult = {
      personas: [
        {
          asset: {
            id: asPersonaId("p-1"),
            version: "1",
            provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
            role: "x",
            responsibilities: [],
            workingApproach: "x",
            constraints: {},
            applicability: {},
          },
          included: true,
          reason: "x",
        },
        {
          asset: {
            id: asPersonaId("p-2"),
            version: "1",
            provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
            role: "x",
            responsibilities: [],
            workingApproach: "x",
            constraints: {},
            applicability: {},
          },
          included: true,
          reason: "x",
        },
      ],
      skills: [],
      knowledge: [],
      memory: [],
      resolvedAt: "2024-01-01T00:00:00Z",
    };
    const pack = builderTight.build({
      runId: asRunId("r-1"),
      resolution,
    });
    expect(pack.assets).toHaveLength(1);
    expect(pack.assets[0]?.assetId).toBe("p-1");
  });

  it("records memory records when approved and applicable", () => {
    const resolution: ContextResolutionResult = {
      personas: [],
      skills: [],
      knowledge: [],
      memory: [
        {
          asset: {
            id: asMemoryRecordId("m-1"),
            kind: "experience" as const,
            provenance: { kind: "approved", source: { kind: "run", runId: asRunId("r-prev"), at: "x" } },
            applicability: {},
            derivedFromRunId: asRunId("r-prev"),
            content: {},
            createdAt: "x",
            updatedAt: "x",
          },
          included: true,
          reason: "applicable",
        },
      ],
      resolvedAt: "2024-01-01T00:00:00Z",
    };
    const pack = builder.build({
      runId: asRunId("r-1"),
      resolution,
    });
    expect(pack.assets).toHaveLength(1);
    expect(pack.assets[0]?.assetKind).toBe("memory");
  });

  it("trims to empty pack when constraints are impossibly tight (no throw)", () => {
    // maxContentBytes = 1 with an asset that's 256 bytes → builder trims
    // to empty (0 bytes), which fits within maxBytes=1.
    // The builder's trim logic prevents constraint violations from
    // producing invalid packs; the defensive `contextPackRespectsConstraints`
    // check is a final safety net.
    const tightBuilder = new DefaultContextPackBuilder(engine, {
      maxAssets: 10,
      maxContentBytes: 1,
    });
    const pack = tightBuilder.build({
      runId: asRunId("r-1"),
      resolution: makeResolutionApproved(),
    });
    expect(pack.assets).toHaveLength(0);
    expect(pack.actualBytes).toBe(0);
  });

  it("trims excess assets down to maxAssets limit", () => {
    const trimBuilder = new DefaultContextPackBuilder(engine, {
      maxAssets: 1,
      maxContentBytes: 10_000,
    });
    const resolution: ContextResolutionResult = {
      personas: [
        {
          asset: {
            id: asPersonaId("p-1"),
            version: "1",
            provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
            role: "x",
            responsibilities: [],
            workingApproach: "x",
            constraints: {},
            applicability: {},
          },
          included: true,
          reason: "x",
        },
        {
          asset: {
            id: asPersonaId("p-2"),
            version: "1",
            provenance: { kind: "approved", source: { kind: "human", actor: "x", at: "x" } },
            role: "x",
            responsibilities: [],
            workingApproach: "x",
            constraints: {},
            applicability: {},
          },
          included: true,
          reason: "x",
        },
      ],
      skills: [],
      knowledge: [],
      memory: [],
      resolvedAt: "2024-01-01T00:00:00Z",
    };
    const pack = trimBuilder.build({
      runId: asRunId("r-1"),
      resolution,
    });
    expect(pack.assets).toHaveLength(1);
    expect(pack.assets[0]?.assetId).toBe("p-1");
  });

  it("records policyConstraints when provided", () => {
    const pack = builder.build({
      runId: asRunId("r-1"),
      resolution: makeResolutionApproved(),
      policyConstraints: ["data-minimization", "no-secrets"],
    });
    expect(pack.policyConstraints).toEqual(["data-minimization", "no-secrets"]);
  });
});
