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
import type {
  ContextPackId,
  RunId,
  PersonaId,
  SkillId,
  KnowledgeId,
  MemoryRecordId,
} from "../core/identifiers.js";
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";

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
export function validateContextPack(cp: unknown): asserts cp is ContextPack {
  if (typeof cp !== "object" || cp === null) {
    throw new ContractValidationError("ContextPack must be a non-null object");
  }
  const r = cp as Record<string, unknown>;
  if (!isValidIdString(r.id)) {
    throw new ContractValidationError("ContextPack.id must be a non-empty string");
  }
  if (!isValidIdString(r.runId)) {
    throw new ContractValidationError("ContextPack.runId must be a non-empty string");
  }
  if (!Array.isArray(r.assets)) {
    throw new ContractValidationError("ContextPack.assets must be an array");
  }
  for (const a of r.assets) {
    if (typeof a !== "object" || a === null) {
      throw new ContractValidationError("ContextPack.assets[*] must be objects");
    }
    const ar = a as Record<string, unknown>;
    if (
      ar.assetKind !== "persona" &&
      ar.assetKind !== "skill" &&
      ar.assetKind !== "knowledge" &&
      ar.assetKind !== "memory"
    ) {
      throw new ContractValidationError("ContextPack.assets[*].assetKind is invalid");
    }
    if (!isValidIdString(ar.assetId)) {
      throw new ContractValidationError("ContextPack.assets[*].assetId must be a non-empty string");
    }
    if (!isValidIdString(ar.version)) {
      throw new ContractValidationError("ContextPack.assets[*].version must be a non-empty string");
    }
    if (typeof ar.selectionReason !== "string" || ar.selectionReason.length === 0) {
      throw new ContractValidationError("ContextPack.assets[*].selectionReason must be a non-empty string");
    }
  }
  if (!Array.isArray(r.exclusions)) {
    throw new ContractValidationError("ContextPack.exclusions must be an array");
  }
  if (typeof r.constraints !== "object" || r.constraints === null) {
    throw new ContractValidationError("ContextPack.constraints must be an object");
  }
  const c = r.constraints as Record<string, unknown>;
  if (typeof c.maxAssets !== "number" || c.maxAssets < 0) {
    throw new ContractValidationError("ContextPack.constraints.maxAssets must be a non-negative number");
  }
  if (typeof c.maxContentBytes !== "number" || c.maxContentBytes < 0) {
    throw new ContractValidationError("ContextPack.constraints.maxContentBytes must be a non-negative number");
  }
  if (typeof r.actualBytes !== "number" || r.actualBytes < 0) {
    throw new ContractValidationError("ContextPack.actualBytes must be a non-negative number");
  }
  if (typeof r.createdAt !== "string" || r.createdAt.length === 0) {
    throw new ContractValidationError("ContextPack.createdAt must be a non-empty string");
  }
}

/**
 * Returns true iff the Context Pack respects its declared resource
 * constraints. A Pack that violates its constraints is invalid for
 * delivery to a Coding Agent.
 */
export function contextPackRespectsConstraints(cp: ContextPack): boolean {
  return cp.assets.length <= cp.constraints.maxAssets && cp.actualBytes <= cp.constraints.maxContentBytes;
}

/**
 * Returns the assets in a Context Pack that are NOT approved operational
 * knowledge (i.e., candidate assets).
 *
 * Used by the policy engine to flag candidate usage for governed review.
 */
export function candidateAssetsInContextPack(cp: ContextPack): readonly ContextPackAssetRef[] {
  return cp.assets.filter(
    (a) => a.provenanceKind !== "approved" && a.provenanceKind !== "deprecated",
  );
}
