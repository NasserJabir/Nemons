/**
 * Nemons Schema — Context Pack
 *
 * A Context Pack is a constructed AND validated package of context
 * selected for a specific Run and intended for consumption by a
 * Coding Agent.
 *
 * Architectural principle enforced here:
 *   "Context Pack ≠ Context" — Context is the broader information
 *   domain; the Context Pack is a deliberate, bounded, traceable
 *   selection of that information.
 *
 * A Context Pack records:
 *   - which assets were included
 *   - their versions
 *   - their provenance
 *   - the selection reasons
 *   - applicable policy constraints
 *   - any explicit exclusions (with reasons)
 */
import type { Provenance } from "../core/provenance.js";
import type { ContextPackId, RunId, PersonaId, SkillId, KnowledgeId, MemoryRecordId } from "../core/identifiers.js";
/**
 * A reference to an asset included in a Context Pack. Carries enough
 * metadata to reconstruct the selection decision (why was this asset
 * included?) without re-resolving the entire Context.
 */
export interface ContextPackAssetRef {
    readonly assetKind: "persona" | "skill" | "knowledge" | "memory";
    readonly assetId: PersonaId | SkillId | KnowledgeId | MemoryRecordId;
    readonly version: string;
    readonly provenanceKind: Provenance["kind"];
    readonly selectionReason: string;
    readonly policyDecisionRef?: string;
}
/**
 * An explicit exclusion — an asset that was considered for inclusion
 * but NOT included, with a reason. Exclusions are recorded so that
 * the Context Pack is fully inspectable.
 */
export interface ContextPackExclusion {
    readonly assetKind: "persona" | "skill" | "knowledge" | "memory";
    readonly assetId: string;
    readonly reason: string;
    readonly reasonKind: "lifecycle" | "policy" | "applicability" | "capability";
}
/**
 * The resource constraints enforced by the Context Pack Builder.
 * Used both at construction (to bound the pack) and at validation
 * (to confirm constraints were respected).
 */
export interface ContextPackResourceConstraints {
    readonly maxAssets: number;
    readonly maxContentBytes: number;
}
/**
 * A Context Pack record.
 *
 * Field invariants:
 *   - `id`: stable ContextPackId.
 *   - `runId`: the Run this Context Pack was constructed for.
 *   - `assets`: the included assets, each with provenance + reason.
 *   - `exclusions`: the excluded assets (considered but not selected).
 *   - `constraints`: the resource constraints in force during construction.
 *   - `actualBytes`: the actual content size (must respect constraints).
 *   - `policyConstraints`: any policy constraints applied (e.g., data
 *      minimization, access boundaries).
 *   - `createdAt`: ISO timestamp of construction.
 */
export interface ContextPack {
    readonly id: ContextPackId;
    readonly runId: RunId;
    readonly assets: readonly ContextPackAssetRef[];
    readonly exclusions: readonly ContextPackExclusion[];
    readonly constraints: ContextPackResourceConstraints;
    readonly actualBytes: number;
    readonly policyConstraints?: readonly string[];
    readonly createdAt: string;
}
/**
 * Validates the structural contract of a Context Pack.
 *
 * Throws `ContractValidationError` on any violation.
 */
export declare function validateContextPack(cp: unknown): asserts cp is ContextPack;
/**
 * Returns true iff the Context Pack respects its declared resource
 * constraints. A Pack that violates its constraints is invalid for
 * delivery to a Coding Agent.
 */
export declare function contextPackRespectsConstraints(cp: ContextPack): boolean;
/**
 * Returns the assets in a Context Pack that are NOT approved operational
 * knowledge (i.e., candidate assets).
 *
 * Used by the policy engine to flag candidate usage for governed review.
 */
export declare function candidateAssetsInContextPack(cp: ContextPack): readonly ContextPackAssetRef[];
//# sourceMappingURL=context-pack.d.ts.map