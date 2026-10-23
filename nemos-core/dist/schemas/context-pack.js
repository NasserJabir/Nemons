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
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";
/**
 * Validates the structural contract of a Context Pack.
 *
 * Throws `ContractValidationError` on any violation.
 */
export function validateContextPack(cp) {
    if (typeof cp !== "object" || cp === null) {
        throw new ContractValidationError("ContextPack must be a non-null object");
    }
    const r = cp;
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
        const ar = a;
        if (ar.assetKind !== "persona" &&
            ar.assetKind !== "skill" &&
            ar.assetKind !== "knowledge" &&
            ar.assetKind !== "memory") {
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
    const c = r.constraints;
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
export function contextPackRespectsConstraints(cp) {
    return cp.assets.length <= cp.constraints.maxAssets && cp.actualBytes <= cp.constraints.maxContentBytes;
}
/**
 * Returns the assets in a Context Pack that are NOT approved operational
 * knowledge (i.e., candidate assets).
 *
 * Used by the policy engine to flag candidate usage for governed review.
 */
export function candidateAssetsInContextPack(cp) {
    return cp.assets.filter((a) => a.provenanceKind !== "approved" && a.provenanceKind !== "deprecated");
}
//# sourceMappingURL=context-pack.js.map