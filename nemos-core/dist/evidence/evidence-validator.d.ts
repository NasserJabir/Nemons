/**
 * Nemons Evidence — Validator
 *
 * The EvidenceValidator verifies the integrity of Evidence records:
 *   - For inline-payload Evidence: the payload MUST hash to the
 *     recorded `contentHash`. If yes → `verified = true`.
 *   - For URI-backed Evidence: external verification is required
 *     (out of scope for the Core — adapters provide the verifier).
 *
 * Architectural principles enforced here:
 *   - "No implicit trust escalation": an Evidence record's `verified`
 *     flag is NEVER silently true. It is set to true ONLY after the
 *     validator confirms the hash matches.
 *   - "Verification over appearance": the validator's job is to confirm
 *     the bytes match the hash, not to inspect the content's meaning.
 */
import type { Evidence } from "../schemas/evidence.js";
/**
 * The EvidenceValidator interface.
 */
export interface EvidenceValidator {
    /**
     * Verifies an Evidence record. Returns a NEW Evidence record with
     * `verified = true` if the hash matches; throws if the hash does not
     * match (an integrity violation is a hard-fail).
     */
    verify(evidence: Evidence): Evidence;
}
/**
 * Default EvidenceValidator implementation.
 *
 * Throws `ContractValidationError` when:
 *   - the Evidence is inline-payload AND the recomputed hash does not
 *     match the recorded `contentHash` (integrity violation).
 *
 * For URI-backed Evidence, the default validator returns the record
 * unchanged (with `verified` as it was — typically `false`). External
 * verifiers are expected for URI-backed records.
 */
export declare class DefaultEvidenceValidator implements EvidenceValidator {
    verify(evidence: Evidence): Evidence;
}
//# sourceMappingURL=evidence-validator.d.ts.map