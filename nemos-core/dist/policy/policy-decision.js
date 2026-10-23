/**
 * Nemons Policy — Decision types
 *
 * A PolicyDecision is the explicit, recorded outcome of evaluating a
 * policy rule against an operation request.
 *
 * Architectural principles enforced here:
 *   - "Observed is not enforced": logging an event does NOT prevent it.
 *     Enforcement happens by returning `deny` and refusing to perform
 *     the operation.
 *   - "Hard-deny security": when required authorization or policy
 *     conditions are not satisfied, the operation MUST be denied.
 *
 * Every PolicyDecision is recorded with full provenance so audits can
 * reconstruct what was evaluated, what rules fired, and why.
 */
/**
 * Combines per-rule outcomes into an aggregate decision.
 *
 * Rules (matches the architectural principle):
 *   - If ANY rule denies → deny (hard-deny wins).
 *   - Else if ANY rule allows → allow (explicit allow overrides the
 *     default-deny baseline's `defer`).
 *   - Else if ANY rule defers → defer (no explicit allow; treated as
 *     deny at the enforcement layer).
 *   - Else → deny (default-deny when no rule produced any outcome).
 *
 * Default-deny is the explicit choice when no rule produces an explicit
 * allow. This encodes "hard-deny security" at the decision level.
 */
export function aggregateOutcomes(rules) {
    if (rules.length === 0)
        return "deny"; // default-deny
    if (rules.some((r) => r.outcome === "deny"))
        return "deny";
    if (rules.some((r) => r.outcome === "allow"))
        return "allow";
    if (rules.some((r) => r.outcome === "defer"))
        return "defer";
    return "deny"; // default-deny
}
/**
 * Returns true iff the PolicyDecision authorizes the operation.
 *
 * `defer` is NOT authorization — deferral requires explicit resolution.
 */
export function isPolicyAllowed(d) {
    return d.outcome === "allow";
}
/**
 * Returns true iff the PolicyDecision hard-denies the operation.
 */
export function isPolicyDenied(d) {
    return d.outcome === "deny";
}
//# sourceMappingURL=policy-decision.js.map