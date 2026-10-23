/**
 * Nemons Schema — Evidence
 *
 * Evidence is the attributable material used to support or challenge
 * a claim about a Run.
 *
 * Architectural principles enforced here:
 *   - "Evidence before claims": execution success and knowledge
 *     promotion must be supported by evidence appropriate to the claim.
 *   - A textual assertion that a task succeeded is NOT, by itself,
 *     sufficient evidence.
 *
 * Examples of valid Evidence:
 *   - source-control revisions and diffs
 *   - test results
 *   - build and validation outputs
 *   - artifact hashes
 *   - adapter events
 *   - verification reports
 *   - explicit acceptance results
 */
import type { Provenance } from "../core/provenance.js";
import type { EvidenceId, RunId } from "../core/identifiers.js";
/**
 * The kind of evidence — distinguishes the source category.
 *
 * `text_assertion` is the lowest-trust kind: a textual claim with no
 * underlying artifact. It is permitted (the runtime allows recording
 * assertions) but it does NOT by itself support a "verified succeeded"
 * claim — see EvidenceKind.isSufficientForSuccess.
 */
export type EvidenceKind = "source_revision" | "test_result" | "build_output" | "validation_output" | "artifact_hash" | "adapter_event" | "verification_report" | "acceptance_result" | "text_assertion";
/**
 * A reference to an artifact backing the Evidence.
 *
 * Either an external URI (e.g., a log file path) or an inline payload
 * with a content hash. Inline payloads are used when the runtime
 * itself produces the artifact (e.g., a verification result computed
 * in-process).
 */
export interface EvidenceArtifactRef {
    readonly uri?: string;
    readonly inlinePayload?: string;
    readonly contentHash: string;
    readonly contentType?: string;
    readonly bytes?: number;
}
/**
 * The component an Evidence record is attributed to (ADR-0012, from
 * HERMES research — https://arxiv.org/abs/2610.07832).
 *
 * HERMES introduces "a bug diagnosis mechanism that maps execution
 * evidence back to the components that must be revised." This
 * interface implements that principle: each Evidence record can
 * optionally link to the specific component (Skill, Knowledge, Tool,
 * Persona) it's about.
 *
 * Together with Failure Attribution (ADR-0010, from MAST), this
 * completes the attribution chain:
 *   1. Run fails → failureAttribution.category = "skill" (ADR-0010)
 *   2. Evidence → attributedComponent = {componentKind: "skill",
 *      componentId: "skill-run-tests", componentVersion: "1.0.0"} (ADR-0012)
 *   3. Offline refinement targets skill-run-tests v1.0.0
 *
 * Field invariants:
 *   - `componentKind`: the kind of component (skill/knowledge/tool/persona/memory/none).
 *     "none" = environment-level Evidence not about a specific component.
 *   - `componentId?`: the component's stable id (e.g., Skill id).
 *   - `componentVersion?`: the component's version (e.g., Skill v1.0.0).
 *   - `relationship`: how the Evidence relates to the component
 *     (e.g., "produced by", "verified against", "failed due to").
 */
export interface AttributedComponent {
    readonly componentKind: "skill" | "knowledge" | "tool" | "persona" | "memory" | "none";
    readonly componentId?: string;
    readonly componentVersion?: string;
    readonly relationship: string;
}
/**
 * An Evidence record.
 *
 * Field invariants:
 *   - `id`: stable EvidenceId.
 *   - `runId`: the Run this Evidence is for.
 *   - `kind`: the source category.
 *   - `claim`: what this Evidence is claimed to support
 *      (e.g., "tests-passed", "build-succeeded").
 *   - `artifact`: the artifact reference, with content hash.
 *   - `provenance`: origin (typically `run`-kind source with runId).
 *   - `recordedAt`: ISO timestamp of recording.
 *   - `verified`: whether the artifact hash has been verified to match
 *      the artifact content. False until verified; never silently true.
 *   - `attributedComponent?`: the component this Evidence is about
 *      (ADR-0012, from HERMES). Optional — not all Evidence is about
 *      a specific component.
 */
export interface Evidence {
    readonly id: EvidenceId;
    readonly runId: RunId;
    readonly kind: EvidenceKind;
    readonly claim: string;
    readonly artifact: EvidenceArtifactRef;
    readonly provenance: Provenance;
    readonly recordedAt: string;
    readonly verified: boolean;
    /**
     * The component this Evidence is attributed to (ADR-0012).
     * Optional — environment-level Evidence may not be about a
     * specific component.
     */
    readonly attributedComponent?: AttributedComponent;
}
/**
 * Validates the structural contract of an Evidence record.
 */
export declare function validateEvidence(e: unknown): asserts e is Evidence;
/**
 * Returns true iff this Evidence kind is SUFFICIENT to support a
 * "verified succeeded" Run-state claim, on its own.
 *
 * `text_assertion` is NOT sufficient. The other kinds MAY be
 * sufficient when paired with the appropriate verification step
 * (see evidence-validator.ts).
 *
 * This function encodes the architectural rule "Evidence before
 * claims": a textual assertion alone does not establish success.
 */
export declare function isEvidenceKindSufficientForSuccess(kind: EvidenceKind): boolean;
/**
 * Computes the content hash of an inline payload using SHA-256.
 *
 * This is the canonical way to set `artifact.contentHash` for
 * inline-payload evidence. External URIs SHOULD set the hash
 * out-of-band (e.g., via the adapter's verification call).
 */
export declare function computeInlinePayloadHash(inlinePayload: string): string;
/**
 * Returns true iff the Evidence's inline payload (if present) hashes
 * to the recorded `contentHash`. Used to verify artifact integrity.
 *
 * Evidence without an inline payload returns false (no payload to
 * verify); such Evidence requires an external verification step.
 */
export declare function verifyInlineEvidence(e: Evidence): boolean;
//# sourceMappingURL=evidence.d.ts.map