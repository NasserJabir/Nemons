/**
 * Nemons Experience — Deriver
 *
 * The ExperienceDeriver produces a structured Experience record from
 * Evidence + Evaluation. It is the canonical path that turns a Run's
 * outcome into reusable operational knowledge.
 *
 * Architectural principles enforced here:
 *   - "Evidence before claims": an Experience CANNOT be derived from a
 *     Run whose Evaluation is NOT `verified_succeeded`. The deriver
 *     hard-fails (throws) when the Evaluation is anything else.
 *   - "No silent mutation": the produced Experience starts with
 *     provenance.kind = "observed" (the lowest trust). Promotion to
 *     reviewed/approved is a separate governed step.
 *   - "Retrieved is not approved": the produced Experience carries
 *     provenance that preserves its origin (the Evaluation + Run it
 *     was derived from), so later retrieval preserves trust status.
 *   - "Use is not adoption": reusability is a SEPARATE field from
 *     provenance.kind. A reusable-but-observed Experience MAY be
 *     selected in explicitly experimental Runs but MUST NOT be treated
 *     as authoritative knowledge.
 */
import { validateExperience } from "../schemas/experience.js";
import { asExperienceId, freshId } from "../core/identifiers.js";
import { ContractValidationError, InsufficientEvidenceError } from "../core/errors.js";
/**
 * Default ExperienceDeriver implementation.
 *
 * The deriver:
 *   1. Verifies the Evaluation is `verified_succeeded`. Throws
 *      `InsufficientEvidenceError` otherwise (the architectural rule
 *      "Evidence before claims" applied to Experience derivation).
 *   2. Verifies the Evaluation's runId matches the Run's id. Throws
 *      `ContractValidationError` on mismatch (defense in depth).
 *   3. Verifies that at least one Evidence record is provided. Throws
 *      `InsufficientEvidenceError` otherwise.
 *   4. Constructs an Experience with:
 *      - id: fresh unique id
 *      - runId: the source Run's id
 *      - evaluationId: the source Evaluation's id
 *      - provenance.kind: "observed" (initial — MUST be promoted later)
 *      - provenance.source: `evidence`-kind with the first Evidence's id
 *        (preserves the chain back to the underlying evidence)
 *      - applicability: derived from Run's taskKind + repo, or overridden
 *      - reusability: `conditionally_reusable` by default (safe default)
 *      - learnedAt: ISO timestamp
 *
 * The deriver does NOT promote the Experience. The Experience starts
 * as `observed` and must be promoted through governed review before
 * being used as authoritative operational knowledge.
 */
export class DefaultExperienceDeriver {
    derive(input) {
        const { run, evaluation, evidence } = input;
        // 1. Verify the Evaluation is verified_succeeded
        if (evaluation.overallResult !== "verified_succeeded") {
            throw new InsufficientEvidenceError(`Cannot derive Experience: Evaluation is ${evaluation.overallResult} (not verified_succeeded). ` +
                `Only verified-succeeded Evaluations support Experience derivation.`, {
                details: {
                    runId: run.id,
                    evaluationId: evaluation.id,
                    overallResult: evaluation.overallResult,
                },
            });
        }
        // 2. Verify the Evaluation is for the Run
        if (evaluation.runId !== run.id) {
            throw new ContractValidationError(`Evaluation.runId (${evaluation.runId}) does not match Run.id (${run.id})`, {
                details: {
                    expectedRunId: run.id,
                    actualRunId: evaluation.runId,
                },
            });
        }
        // 3. Verify at least one Evidence record is provided
        if (evidence.length === 0) {
            throw new InsufficientEvidenceError("Cannot derive Experience: no Evidence records provided.", { details: { runId: run.id, evaluationId: evaluation.id } });
        }
        // 4. Construct the Experience
        const nowIso = new Date().toISOString();
        const id = asExperienceId(freshId());
        const evaluationId = evaluation.id;
        const runId = run.id;
        // Provenance: observed-kind (initial); source is the first Evidence record
        // (preserves the chain back to the underlying artifact)
        const sourceEvidenceId = evidence[0].id;
        const source = {
            kind: "evidence",
            evidenceId: sourceEvidenceId, // branded type
            at: nowIso,
        };
        const provenance = {
            kind: "observed",
            source,
            // contentHash will be set when the Experience is stored (Stage E)
        };
        // Applicability: derive defaults from Run if not overridden
        const applicability = {
            taskKinds: input.applicability?.taskKinds ?? [run.inputs.taskKind],
            taskTags: input.applicability?.taskTags ?? run.inputs.taskTags,
            repoPatterns: input.applicability?.repoPatterns ?? [
                run.inputs.repoInstance.repoIdentity.repo,
            ],
            adapterKinds: input.applicability?.adapterKinds,
        };
        // Reusability: default to conditionally_reusable (the safe default)
        const reusability = input.reusability ?? "conditionally_reusable";
        const experience = {
            id,
            runId,
            evaluationId,
            provenance,
            applicability,
            reusability,
            reuseConditions: input.reuseConditions,
            summary: input.summary,
            learnedAt: nowIso,
        };
        // Validate the constructed Experience
        validateExperience(experience);
        return experience;
    }
}
//# sourceMappingURL=experience-deriver.js.map