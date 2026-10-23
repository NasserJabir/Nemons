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
import { verifyInlineEvidence } from "../schemas/evidence.js";
import { ContractValidationError } from "../core/errors.js";

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
export class DefaultEvidenceValidator implements EvidenceValidator {
  verify(evidence: Evidence): Evidence {
    if (evidence.artifact.inlinePayload !== undefined) {
      const ok = verifyInlineEvidence(evidence);
      if (!ok) {
        throw new ContractValidationError(
          "Evidence integrity violation: inline payload does not hash to the recorded contentHash",
          {
            details: {
              evidenceId: evidence.id,
              expected: evidence.artifact.contentHash,
            },
          },
        );
      }
      return { ...evidence, verified: true };
    }
    // URI-backed: external verification required
    return evidence;
  }
}
