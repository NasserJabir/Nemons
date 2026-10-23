/**
 * Nemons Schema — Evaluation
 *
 * Evaluation determines whether a Run or an operational asset meets
 * defined criteria.
 *
 * An Evaluation identifies:
 *   - the criteria examined
 *   - the evidence examined
 *   - the result
 *   - the limitations
 *   - the evaluator (procedure or actor)
 *
 * Evaluation is DISTINCT from "execution success": a Run may claim
 * to have succeeded, but Evaluation is the explicit step that decides
 * whether the claim is supported by sufficient Evidence.
 */
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";
/**
 * Validates the structural contract of an Evaluation record.
 */
export function validateEvaluation(e) {
    if (typeof e !== "object" || e === null) {
        throw new ContractValidationError("Evaluation must be a non-null object");
    }
    const r = e;
    if (!isValidIdString(r.id)) {
        throw new ContractValidationError("Evaluation.id must be a non-empty string");
    }
    if (!isValidIdString(r.runId)) {
        throw new ContractValidationError("Evaluation.runId must be a non-empty string");
    }
    if (!Array.isArray(r.criteria)) {
        throw new ContractValidationError("Evaluation.criteria must be an array");
    }
    if (!Array.isArray(r.results)) {
        throw new ContractValidationError("Evaluation.results must be an array");
    }
    if (r.overallResult !== "verified_succeeded" &&
        r.overallResult !== "claimed_succeeded_unverified" &&
        r.overallResult !== "failed" &&
        r.overallResult !== "inconclusive") {
        throw new ContractValidationError("Evaluation.overallResult must be a valid EvaluationResult");
    }
    if (typeof r.provenance !== "object" || r.provenance === null) {
        throw new ContractValidationError("Evaluation.provenance must be an object");
    }
    if (typeof r.evaluatedAt !== "string" || r.evaluatedAt.length === 0) {
        throw new ContractValidationError("Evaluation.evaluatedAt must be a non-empty string");
    }
    if (typeof r.evaluator !== "string" || r.evaluator.length === 0) {
        throw new ContractValidationError("Evaluation.evaluator must be a non-empty string");
    }
}
/**
 * Returns true iff the Evaluation verifies the Run's success
 * (i.e., `overallResult === "verified_succeeded"`).
 *
 * This is the canonical check; only verified-succeeded Evaluations
 * support promoting a Run's outcome into Experience.
 */
export function isEvaluationVerifiedSucceeded(e) {
    return e.overallResult === "verified_succeeded";
}
//# sourceMappingURL=evaluation.js.map