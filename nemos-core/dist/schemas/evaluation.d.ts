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
import type { Provenance } from "../core/provenance.js";
import type { EvaluationId, RunId } from "../core/identifiers.js";
/**
 * The outcome of an Evaluation.
 *
 * - `verified_succeeded`: criteria met AND required Evidence present.
 * - `claimed_succeeded_unverified`: the Run claimed success but the
 *     required Evidence is absent or insufficient. NOT a verified
 *     success — MUST NOT be treated as one.
 * - `failed`: criteria not met, or Evidence shows the Run failed.
 * - `inconclusive`: criteria could not be evaluated (e.g., Evidence
 *     was missing or invalid).
 */
export type EvaluationResult = "verified_succeeded" | "claimed_succeeded_unverified" | "failed" | "inconclusive";
/**
 * A single criterion that an Evaluation checks. Each criterion has:
 *   - `id`: stable identifier within the criteria set.
 *   - `description`: human-readable statement.
 *   - `requiredEvidenceKinds`: the Evidence kinds that MUST be present
 *      to satisfy this criterion.
 *   - `required`: when false, the criterion is informational only.
 */
export interface EvaluationCriterion {
    readonly id: string;
    readonly description: string;
    readonly requiredEvidenceKinds: readonly string[];
    readonly required: boolean;
}
/**
 * The result of evaluating a single criterion.
 */
export interface CriterionEvaluationResult {
    readonly criterionId: string;
    readonly satisfied: boolean;
    readonly examinedEvidenceRefs: readonly string[];
    readonly reason: string;
}
/**
 * An Evaluation record.
 *
 * Field invariants:
 *   - `id`: stable EvaluationId.
 *   - `runId`: the Run being evaluated.
 *   - `criteria`: the criteria set used.
 *   - `results`: the per-criterion results.
 *   - `overallResult`: the aggregate Evaluation result.
 *   - `provenance`: origin (typically a `human` or `run`-kind source).
 *   - `evaluatedAt`: ISO timestamp of evaluation.
 *   - `limitations`: known limitations of this Evaluation (e.g.,
 *      "criteria do not cover integration tests").
 *   - `evaluator`: who or what performed the Evaluation.
 */
export interface Evaluation {
    readonly id: EvaluationId;
    readonly runId: RunId;
    readonly criteria: readonly EvaluationCriterion[];
    readonly results: readonly CriterionEvaluationResult[];
    readonly overallResult: EvaluationResult;
    readonly provenance: Provenance;
    readonly evaluatedAt: string;
    readonly limitations?: readonly string[];
    readonly evaluator: string;
}
/**
 * Validates the structural contract of an Evaluation record.
 */
export declare function validateEvaluation(e: unknown): asserts e is Evaluation;
/**
 * Returns true iff the Evaluation verifies the Run's success
 * (i.e., `overallResult === "verified_succeeded"`).
 *
 * This is the canonical check; only verified-succeeded Evaluations
 * support promoting a Run's outcome into Experience.
 */
export declare function isEvaluationVerifiedSucceeded(e: Evaluation): boolean;
//# sourceMappingURL=evaluation.d.ts.map