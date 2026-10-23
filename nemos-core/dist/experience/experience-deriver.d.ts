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
import type { Evidence } from "../schemas/evidence.js";
import type { Evaluation } from "../schemas/evaluation.js";
import type { Experience, ExperienceReusability } from "../schemas/experience.js";
import type { Run } from "../schemas/run.js";
/**
 * Inputs to derive an Experience.
 *
 * `run` — the Run that produced the outcome.
 * `evaluation` — the verified-succeeded Evaluation supporting the
 *   Experience. MUST be `verified_succeeded`; otherwise the deriver
 *   throws.
 * `evidence` — the Evidence backing the Evaluation. Used to construct
 *   the Experience's provenance source chain.
 * `applicability` — optional override of the Experience's applicability
 *   conditions. If omitted, defaults are derived from the Run's task
 *   kind and the Run's repository identity.
 * `reusability` — the reusability classification. Defaults to
 *   `conditionally_reusable` (the safe default for an observed
 *   Experience — must be approved before being unconditionally reusable).
 * `summary` — human-readable summary of what was learned.
 */
export interface DeriveExperienceInput {
    readonly run: Run;
    readonly evaluation: Evaluation;
    readonly evidence: readonly Evidence[];
    readonly applicability?: Partial<Experience["applicability"]>;
    readonly reusability?: ExperienceReusability;
    readonly reuseConditions?: readonly string[];
    readonly summary: string;
}
/**
 * The ExperienceDeriver interface.
 */
export interface ExperienceDeriver {
    derive(input: DeriveExperienceInput): Experience;
}
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
export declare class DefaultExperienceDeriver implements ExperienceDeriver {
    derive(input: DeriveExperienceInput): Experience;
}
//# sourceMappingURL=experience-deriver.d.ts.map