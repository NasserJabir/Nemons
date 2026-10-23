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
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString, sha256Hex } from "../core/identifiers.js";
/**
 * Validates the structural contract of an Evidence record.
 */
export function validateEvidence(e) {
    if (typeof e !== "object" || e === null) {
        throw new ContractValidationError("Evidence must be a non-null object");
    }
    const r = e;
    if (!isValidIdString(r.id)) {
        throw new ContractValidationError("Evidence.id must be a non-empty string");
    }
    if (!isValidIdString(r.runId)) {
        throw new ContractValidationError("Evidence.runId must be a non-empty string");
    }
    const validKinds = [
        "source_revision",
        "test_result",
        "build_output",
        "validation_output",
        "artifact_hash",
        "adapter_event",
        "verification_report",
        "acceptance_result",
        "text_assertion",
    ];
    if (typeof r.kind !== "string" || !validKinds.includes(r.kind)) {
        throw new ContractValidationError("Evidence.kind must be a valid EvidenceKind", {
            details: { field: "kind", value: r.kind },
        });
    }
    if (typeof r.claim !== "string" || r.claim.length === 0) {
        throw new ContractValidationError("Evidence.claim must be a non-empty string");
    }
    if (typeof r.artifact !== "object" || r.artifact === null) {
        throw new ContractValidationError("Evidence.artifact must be an object");
    }
    const a = r.artifact;
    if (typeof a.contentHash !== "string" || a.contentHash.length === 0) {
        throw new ContractValidationError("Evidence.artifact.contentHash must be a non-empty string");
    }
    if (a.uri === undefined && a.inlinePayload === undefined) {
        throw new ContractValidationError("Evidence.artifact must have either uri or inlinePayload");
    }
    if (typeof r.provenance !== "object" || r.provenance === null) {
        throw new ContractValidationError("Evidence.provenance must be an object");
    }
    if (typeof r.recordedAt !== "string" || r.recordedAt.length === 0) {
        throw new ContractValidationError("Evidence.recordedAt must be a non-empty string");
    }
    if (typeof r.verified !== "boolean") {
        throw new ContractValidationError("Evidence.verified must be a boolean");
    }
}
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
export function isEvidenceKindSufficientForSuccess(kind) {
    return kind !== "text_assertion";
}
/**
 * Computes the content hash of an inline payload using SHA-256.
 *
 * This is the canonical way to set `artifact.contentHash` for
 * inline-payload evidence. External URIs SHOULD set the hash
 * out-of-band (e.g., via the adapter's verification call).
 */
export function computeInlinePayloadHash(inlinePayload) {
    return sha256Hex(inlinePayload);
}
/**
 * Returns true iff the Evidence's inline payload (if present) hashes
 * to the recorded `contentHash`. Used to verify artifact integrity.
 *
 * Evidence without an inline payload returns false (no payload to
 * verify); such Evidence requires an external verification step.
 */
export function verifyInlineEvidence(e) {
    if (e.artifact.inlinePayload === undefined)
        return false;
    return computeInlinePayloadHash(e.artifact.inlinePayload) === e.artifact.contentHash;
}
//# sourceMappingURL=evidence.js.map