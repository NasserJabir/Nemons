/**
 * Nemons Schema — Category-Conditioned Retention Policy
 *
 * The CategoryRetentionPolicy conditions memory retention decisions on
 * the semantic category of the Memory record. Strict categories
 * (values, predictions) require stronger provenance before retention;
 * lenient categories (facts, procedures, decisions) can be retained
 * as observed.
 *
 * Architectural principles enforced here:
 *   - "Category-Conditioned Memory Retention" (ADR-0014):
 *     "an assertion weakly supported by its source can be stored and
 *     later reused as established fact." The policy prevents this by
 *     requiring stronger provenance for weakly-supported categories.
 *   - "Retrieved is not approved": retention with a stricter threshold
 *     doesn't mean the record is approved — it means the record's
 *     provenance must meet a higher bar before it's retained at all.
 *   - "No silent mutation": the policy is read-only — it checks
 *     retention eligibility without modifying any records.
 *
 * Research source: https://arxiv.org/abs/2610.07100
 * "Values/beliefs have only 77.9% source support (vs. 96.2% for others).
 * Category-conditioned thresholds reduce unsupported retentions by ~36%."
 */
import { meetsMinimumTrust } from "../core/provenance.js";
/**
 * Default retention policy (ADR-0014).
 *
 * Encodes the paper's finding:
 *   - Values/beliefs have 77.9% source support → require "reviewed"
 *   - Predictions are unverified by definition → require "reviewed"
 *   - Facts/procedures/decisions are typically well-evidenced → "observed" OK
 */
export const DEFAULT_CATEGORY_RETENTION_POLICY = {
    strictCategories: ["value", "prediction"],
    lenientCategories: ["fact", "procedure", "decision"],
    strictProvenanceMinimum: "reviewed",
    lenientProvenanceMinimum: "observed",
};
/**
 * Checks whether a Memory record should be retained, based on its
 * category and provenance.
 *
 * Algorithm:
 *   1. Determine the record's category (default: "uncategorized").
 *   2. If the category is in `strictCategories`:
 *      a. Check if `provenance.kind` meets `strictProvenanceMinimum`.
 *      b. If yes → retain.
 *      c. If no → flagForReview (needs stronger provenance).
 *   3. If the category is in `lenientCategories`:
 *      a. Check if `provenance.kind` meets `lenientProvenanceMinimum`.
 *      b. If yes → retain.
 *      c. If no → reject.
 *   4. If the category is "uncategorized" or not in any list:
 *      a. Use the lenient minimum (backward-compatible behavior).
 *
 * @param record - the Memory record to check
 * @param policy - the retention policy (default: DEFAULT_CATEGORY_RETENTION_POLICY)
 * @returns the retention check result
 */
export function checkRetention(record, policy = DEFAULT_CATEGORY_RETENTION_POLICY) {
    const category = record.category ?? "uncategorized";
    const provenanceKind = record.provenance.kind;
    // Check if the category is strict
    if (policy.strictCategories.includes(category)) {
        if (meetsMinimumTrust(record.provenance, policy.strictProvenanceMinimum)) {
            return {
                kind: "retain",
                reason: `Category '${category}' is strict but provenance '${provenanceKind}' meets the minimum '${policy.strictProvenanceMinimum}'.`,
            };
        }
        return {
            kind: "flagForReview",
            reason: `Category '${category}' is strict (values/predictions have lower source support per ADR-0014); provenance '${provenanceKind}' does not meet the minimum '${policy.strictProvenanceMinimum}'. Flag for review before retention.`,
            requiredProvenance: policy.strictProvenanceMinimum,
            currentProvenance: provenanceKind,
        };
    }
    // Check if the category is lenient
    if (policy.lenientCategories.includes(category)) {
        if (meetsMinimumTrust(record.provenance, policy.lenientProvenanceMinimum)) {
            return {
                kind: "retain",
                reason: `Category '${category}' is lenient and provenance '${provenanceKind}' meets the minimum '${policy.lenientProvenanceMinimum}'.`,
            };
        }
        return {
            kind: "reject",
            reason: `Category '${category}' is lenient but provenance '${provenanceKind}' does not meet the minimum '${policy.lenientProvenanceMinimum}'.`,
        };
    }
    // Uncategorized — use lenient minimum (backward-compatible)
    if (meetsMinimumTrust(record.provenance, policy.lenientProvenanceMinimum)) {
        return {
            kind: "retain",
            reason: `Category is '${category}' (uncategorized); using lenient minimum '${policy.lenientProvenanceMinimum}'. Provenance '${provenanceKind}' meets the minimum.`,
        };
    }
    return {
        kind: "reject",
        reason: `Category is '${category}' (uncategorized); provenance '${provenanceKind}' does not meet the lenient minimum '${policy.lenientProvenanceMinimum}'.`,
    };
}
/**
 * Returns true iff the retention check result is "retain".
 */
export function shouldRetain(result) {
    return result.kind === "retain";
}
/**
 * Returns true iff the retention check result is "flagForReview".
 */
export function needsReview(result) {
    return result.kind === "flagForReview";
}
//# sourceMappingURL=category-retention-policy.js.map