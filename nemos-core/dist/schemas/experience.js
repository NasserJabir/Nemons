/**
 * Nemons Schema — Experience
 *
 * Experience is a structured record derived from execution evidence
 * and evaluation. It captures what was learned, under which conditions,
 * and whether it is suitable for reuse.
 *
 * Architectural principles enforced here:
 *   - Experience is NOT a raw transcript or an unverified success story.
 *   - Experience MUST be derived from Evidence + Evaluation, never from
 *     a claim alone.
 *   - Experience MUST record its provenance and applicability conditions
 *     so retrieval can preserve trust status.
 */
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";
/**
 * Validates the structural contract of an Experience record.
 */
export function validateExperience(e) {
    if (typeof e !== "object" || e === null) {
        throw new ContractValidationError("Experience must be a non-null object");
    }
    const r = e;
    if (!isValidIdString(r.id)) {
        throw new ContractValidationError("Experience.id must be a non-empty string");
    }
    if (!isValidIdString(r.runId)) {
        throw new ContractValidationError("Experience.runId must be a non-empty string");
    }
    if (!isValidIdString(r.evaluationId)) {
        throw new ContractValidationError("Experience.evaluationId must be a non-empty string");
    }
    if (typeof r.provenance !== "object" || r.provenance === null) {
        throw new ContractValidationError("Experience.provenance must be an object");
    }
    if (typeof r.applicability !== "object" || r.applicability === null) {
        throw new ContractValidationError("Experience.applicability must be an object");
    }
    if (r.reusability !== "reusable" &&
        r.reusability !== "conditionally_reusable" &&
        r.reusability !== "not_reusable") {
        throw new ContractValidationError("Experience.reusability must be a valid ExperienceReusability");
    }
    if (typeof r.summary !== "string" || r.summary.length === 0) {
        throw new ContractValidationError("Experience.summary must be a non-empty string");
    }
    if (typeof r.learnedAt !== "string" || r.learnedAt.length === 0) {
        throw new ContractValidationError("Experience.learnedAt must be a non-empty string");
    }
    // An Experience marked `reusable` MUST have an evaluationId; this is
    // enforced by the type, but we re-check here for defense in depth.
    if (r.reusability === "reusable" && !isValidIdString(r.evaluationId)) {
        throw new ContractValidationError("A reusable Experience MUST have an evaluationId (verified-succeeded Evaluation)");
    }
}
/**
 * Returns true iff the Experience is eligible for reuse.
 */
export function isExperienceReusable(e) {
    return e.reusability === "reusable" || e.reusability === "conditionally_reusable";
}
/**
 * Returns true iff the Experience is approved (i.e., its provenance
 * kind is `approved`). This is the canonical "approved operational
 * knowledge" check.
 */
export function isExperienceApproved(e) {
    return e.provenance.kind === "approved";
}
/**
 * Returns true iff BOTH:
 *   - the Experience is approved operational knowledge
 *   - the Experience is reusable
 *
 * This is the conjunction enforced by the policy engine before
 * Experience can be included in a Context Pack for a non-experimental
 * Run.
 */
export function isExperienceApprovedAndReusable(e) {
    return isExperienceApproved(e) && isExperienceReusable(e);
}
//# sourceMappingURL=experience.js.map