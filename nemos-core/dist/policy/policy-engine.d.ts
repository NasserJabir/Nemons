/**
 * Nemons Policy — Engine
 *
 * The PolicyEngine evaluates ALL applicable rules for an operation,
 * aggregates their outcomes, and produces a `PolicyDecision`.
 *
 * Architectural principles enforced here:
 *   - "Hard-deny security": when any rule denies, the aggregate is
 *     `deny`. When no rule allows, the aggregate is `deny` (default-deny).
 *   - "Observed is not enforced": the engine does NOT just log; it
 *     RETURNS the decision so the caller MUST respect it. Callers are
 *     expected to throw `PolicyDeniedError` when the decision is deny.
 *
 * The engine is itself stateless and pure: it does not mutate state
 * or perform I/O. All effects happen at the call site.
 */
import type { PolicyDecision } from "./policy-decision.js";
import type { PolicyRuleRegistry, PolicyEvaluationContext } from "./policy-contracts.js";
/**
 * The PolicyEngine interface. Takes an operation request and returns
 * a PolicyDecision. The decision is final within the runtime; callers
 * must respect it.
 */
export interface PolicyEngine {
    /**
     * Evaluates the policy for the given operation and inputs.
     * Returns a `PolicyDecision` with the aggregate outcome and the
     * full rule evaluation trail.
     */
    decide(ctx: PolicyEvaluationContext): PolicyDecision;
}
/**
 * The default PolicyEngine implementation.
 *
 * Implementation:
 *   - Looks up rules that apply to the operation.
 *   - Evaluates each rule against the context.
 *   - Aggregates outcomes (deny wins, then defer, then allow, else deny).
 *   - Returns a recorded PolicyDecision with a stable id.
 *
 * The engine is the canonical place where "hard-deny" is enforced:
 * the aggregate function denies if ANY rule denies, or if NO rule
 * produces an explicit allow. There is no implicit allow path.
 */
export declare class DefaultPolicyEngine implements PolicyEngine {
    private readonly registry;
    constructor(registry: PolicyRuleRegistry);
    decide(ctx: PolicyEvaluationContext): PolicyDecision;
    private summarize;
}
/**
 * Convenience helper: throws `PolicyDeniedError` when the decision is
 * NOT an allow. Callers should wrap any operation they perform with
 * this helper to ensure hard-deny behavior is enforced uniformly.
 */
export declare function enforceDecision(decision: PolicyDecision): void;
export type { PolicyOperationKind } from "./policy-decision.js";
//# sourceMappingURL=policy-engine.d.ts.map