/**
 * Nemons Core — Provenance
 *
 * Provenance captures WHERE an asset or record came from, WHO or WHAT
 * produced it, and WHICH Run, source, or transformation it derives from.
 *
 * Provenance MUST exist before an asset is considered "reviewed" —
 * provenance-first is a non-negotiable architectural rule.
 *
 * Provenance is distinct from "approval": provenance establishes origin,
 * not authorization. A retrieved record retains its provenance even
 * when used; retrieval does not elevate trust status.
 */
/**
 * Predicate: does the provenance satisfy the minimum required trust
 * status for a given operation? (i.e., is the kind at-or-above the
 * minimum required level?)
 *
 * Order (low → high trust):
 *   observed < imported < proposed < reviewed < approved
 *   (deprecated is "post-approval retired", treated specially)
 */
export function meetsMinimumTrust(p, minimum) {
    if (p.kind === "deprecated")
        return false;
    const order = [
        "observed",
        "imported",
        "proposed",
        "reviewed",
        "approved",
    ];
    const a = order.indexOf(p.kind);
    const b = order.indexOf(minimum);
    // If either is -1, treat as not meeting — defensive.
    if (a < 0 || b < 0)
        return false;
    return a >= b;
}
/**
 * Returns true when the provenance kind has been explicitly retired
 * from active use. Retrieval of deprecated records is allowed for
 * audit/inspection but use is governed.
 */
export function isDeprecated(p) {
    return p.kind === "deprecated";
}
/**
 * Returns true when the provenance indicates the record is approved
 * operational knowledge (i.e., eligible for non-candidate use
 * subject to other policy constraints).
 */
export function isApproved(p) {
    return p.kind === "approved";
}
/**
 * Returns true when the provenance is "observed" only — i.e., derived
 * from runtime observation but not yet promoted through any review.
 *
 * Such records MUST NOT be used as authoritative operational knowledge.
 */
export function isObservedOnly(p) {
    return p.kind === "observed";
}
//# sourceMappingURL=provenance.js.map