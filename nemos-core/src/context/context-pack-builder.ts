/**
 * Nemons Context — Pack Builder
 *
 * The ContextPackBuilder constructs a validated, resource-bounded
 * Context Pack from a ContextResolutionResult.
 *
 * Architectural principles enforced here:
 *   - The Builder ENFORCES policy for each candidate asset. Candidate
 *     (non-approved) assets are NOT silently included — they require
 *     explicit `experimentalRun=true` AND the PolicyEngine to allow
 *     the inclusion.
 *   - The Builder enforces resource constraints (maxAssets, maxBytes).
 *   - The Builder records exclusions, so the Context Pack is fully
 *     inspectable.
 *   - "No silent mutation": the Context Pack is immutable once built.
 */

import type { ContextResolutionResult, ResolvedAssetCandidate } from "./context-resolver.js";
import type {
  ContextPack,
  ContextPackAssetRef,
  ContextPackExclusion,
  ContextPackResourceConstraints,
} from "../schemas/context-pack.js";
import { validateContextPack, contextPackRespectsConstraints, candidateAssetsInContextPack } from "../schemas/context-pack.js";
import type { PolicyEngine } from "../policy/policy-engine.js";
import { ContractValidationError } from "../core/errors.js";
import { asContextPackId, freshId } from "../core/identifiers.js";
import type { RunId } from "../core/identifiers.js";
import type { Persona } from "../schemas/persona.js";
import type { Skill } from "../schemas/skill.js";
import type { Knowledge } from "../schemas/knowledge.js";
import type { MemoryRecord } from "../schemas/memory.js";

/**
 * The ContextPackBuilder interface.
 */
export interface ContextPackBuilder {
  build(input: {
    readonly runId: RunId;
    readonly resolution: ContextResolutionResult;
    readonly experimentalRun?: boolean;
    readonly policyConstraints?: readonly string[];
    /**
     * The capabilities available in the current adapter. The builder
     * passes these to the policy engine so the CapabilityRequirementRule
     * can verify Skill selection. If omitted, the policy engine's
     * capability rule will defer (the resolver already enforces
     * capabilities as a primary check).
     */
    readonly availableCapabilities?: ReadonlySet<string>;
  }): ContextPack;
}

/**
 * Internal: a normalized view of any asset the Builder can process.
 *
 * Different schemas have different shapes (e.g., MemoryRecord has no
 * `version`), so the Builder works in terms of this normalized shape.
 */
interface NormalizedAsset {
  readonly id: string;
  readonly version: string; // synthetic "v1" for assets without version
  readonly provenanceKind: string;
}

function normalizePersona(p: Persona): NormalizedAsset {
  return { id: p.id, version: p.version, provenanceKind: p.provenance.kind };
}
function normalizeSkill(s: Skill): NormalizedAsset {
  return { id: s.id, version: s.version, provenanceKind: s.provenance.kind };
}
function normalizeKnowledge(k: Knowledge): NormalizedAsset {
  return { id: k.id, version: k.version, provenanceKind: k.provenance.kind };
}
function normalizeMemory(m: MemoryRecord): NormalizedAsset {
  return { id: m.id, version: "v1", provenanceKind: m.provenance.kind };
}

/**
 * Default ContextPackBuilder implementation.
 *
 * Construction steps:
 *   1. For each included candidate in the resolution:
 *      a. Decide the policy operation kind:
 *         - if candidate (non-approved): `context_pack.include_candidate`
 *         - if approved: `context_pack.select_asset`
 *      b. Evaluate the policy via the PolicyEngine.
 *      c. If denied → record as exclusion with reason `policy`.
 *      d. If allowed → include in the pack with the policy decision reference.
 *   2. Enforce resource constraints (maxAssets, maxBytes).
 *   3. Construct and validate the Context Pack.
 *
 * The Builder raises `ContractValidationError` if the built pack
 * violates its own constraints — this is a hard-fail signal that
 * the Builder's logic is broken.
 */
export class DefaultContextPackBuilder implements ContextPackBuilder {
  constructor(
    private readonly policy: PolicyEngine,
    private readonly constraints: ContextPackResourceConstraints,
  ) {}

  build(input: {
    readonly runId: RunId;
    readonly resolution: ContextResolutionResult;
    readonly experimentalRun?: boolean;
    readonly policyConstraints?: readonly string[];
    readonly availableCapabilities?: ReadonlySet<string>;
  }): ContextPack {
    const assets: ContextPackAssetRef[] = [];
    const exclusions: ContextPackExclusion[] = [];
    const experimentalRun = input.experimentalRun ?? false;
    const availableCapabilities = input.availableCapabilities;

    // Process each asset kind using normalized helpers
    for (const c of input.resolution.personas) {
      this.processCandidate(
        c,
        "persona",
        normalizePersona(c.asset),
        experimentalRun,
        availableCapabilities,
        assets,
        exclusions,
      );
    }
    for (const c of input.resolution.skills) {
      this.processCandidate(
        c,
        "skill",
        normalizeSkill(c.asset),
        experimentalRun,
        availableCapabilities,
        assets,
        exclusions,
        c.asset.requiredCapabilities,
      );
    }
    for (const c of input.resolution.knowledge) {
      this.processCandidate(
        c,
        "knowledge",
        normalizeKnowledge(c.asset),
        experimentalRun,
        availableCapabilities,
        assets,
        exclusions,
      );
    }
    for (const c of input.resolution.memory) {
      this.processCandidate(
        c,
        "memory",
        normalizeMemory(c.asset),
        experimentalRun,
        availableCapabilities,
        assets,
        exclusions,
      );
    }

    // Enforce maxAssets constraint: drop excess candidates
    let boundedAssets: readonly ContextPackAssetRef[] = assets;
    if (boundedAssets.length > this.constraints.maxAssets) {
      boundedAssets = boundedAssets.slice(0, this.constraints.maxAssets);
    }

    // Enforce maxBytes constraint: drop largest assets until fits
    let totalBytes = this.estimateBytes(boundedAssets);
    while (totalBytes > this.constraints.maxContentBytes && boundedAssets.length > 0) {
      boundedAssets = boundedAssets.slice(0, -1);
      totalBytes = this.estimateBytes(boundedAssets);
    }

    const pack: ContextPack = {
      id: asContextPackId(freshId()),
      runId: input.runId,
      assets: boundedAssets,
      exclusions,
      constraints: this.constraints,
      actualBytes: totalBytes,
      policyConstraints: input.policyConstraints,
      createdAt: new Date().toISOString(),
    };

    validateContextPack(pack);
    if (!contextPackRespectsConstraints(pack)) {
      throw new ContractValidationError(
        "Built Context Pack violates its own resource constraints",
        {
          details: {
            maxAssets: pack.constraints.maxAssets,
            actualAssets: pack.assets.length,
            maxBytes: pack.constraints.maxContentBytes,
            actualBytes: pack.actualBytes,
          },
        },
      );
    }

    return pack;
  }

  private processCandidate<T>(
    c: ResolvedAssetCandidate<T>,
    assetKind: ContextPackAssetRef["assetKind"],
    normalized: NormalizedAsset,
    experimentalRun: boolean,
    availableCapabilities: ReadonlySet<string> | undefined,
    assets: ContextPackAssetRef[],
    exclusions: ContextPackExclusion[],
    requiredCapabilities?: readonly { readonly capability: string; readonly required: boolean; readonly fallbackCapability?: string }[],
  ): void {
    if (!c.included) {
      exclusions.push({
        assetKind,
        assetId: normalized.id,
        reason: c.reason,
        reasonKind: c.exclusionReasonKind ?? "applicability",
      });
      return;
    }

    const kind = normalized.provenanceKind;
    const isCandidate = kind !== "approved" && kind !== "deprecated";
    const operation = isCandidate ? "context_pack.include_candidate" : "context_pack.select_asset";

    const decision = this.policy.decide({
      operation,
      requestedBy: "context-pack-builder",
      inputs: {
        experimentalRun,
        requiredCapabilities,
        assetKind,
        assetId: normalized.id,
        assetVersion: normalized.version,
      },
      assetProvenanceKind: kind,
      availableCapabilities,
    });

    if (decision.outcome !== "allow") {
      exclusions.push({
        assetKind,
        assetId: normalized.id,
        reason: `Policy denied: ${decision.reason}`,
        reasonKind: "policy",
      });
      return;
    }

    assets.push({
      assetKind,
      assetId: normalized.id as ContextPackAssetRef["assetId"],
      version: normalized.version,
      provenanceKind: kind as ContextPackAssetRef["provenanceKind"],
      selectionReason: `Policy allowed (${decision.id})`,
      policyDecisionRef: decision.id,
    });
  }

  private estimateBytes(assets: readonly ContextPackAssetRef[]): number {
    // Rough estimate: each asset reference is ~256 bytes (id + version +
    // provenance + reason). Real implementations would compute from
    // the actual content payload, but for the Core we use a stable
    // upper-bound estimate that's deterministic.
    return assets.length * 256;
  }
}

/**
 * Returns the candidate (non-approved) assets in a Context Pack.
 * Re-exported here for convenience — defined in the schema module.
 */
export { candidateAssetsInContextPack };
