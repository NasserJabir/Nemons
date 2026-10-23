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
import type { PolicyDecisionId } from "../core/identifiers.js";
/**
 * The outcome of evaluating a policy rule.
 *
 * - `allow`: the operation is permitted.
 * - `deny`: the operation is forbidden. Hard-deny.
 * - `defer`: the policy cannot decide; requires additional input
 *     (e.g., explicit human approval). Treated as `deny` for
 *     enforcement purposes until the deferral is resolved.
 */
export type PolicyDecisionOutcome = "allow" | "deny" | "defer";
/**
 * A single rule that fired during evaluation, with the inputs and the
 * outcome it produced.
 */
export interface PolicyRuleEvaluation {
    readonly ruleId: string;
    readonly ruleDescription: string;
    readonly outcome: PolicyDecisionOutcome;
    readonly reason: string;
    readonly matchedInputs?: Readonly<Record<string, unknown>>;
}
/**
 * The kind of operation a PolicyDecision covers. Used to dispatch
 * to the correct rule set and to make audits structured.
 */
export type PolicyOperationKind = "run.start" | "run.record_evidence" | "run.transition_state" | "context_pack.select_asset" | "context_pack.include_candidate" | "memory.retrieve" | "experience.reuse" | "knowledge.promote" | "skill.promote" | "persona.promote" | "adapter.invoke" | "governed_evolution.propose_change";
/**
 * A PolicyDecision record.
 *
 * Field invariants:
 *   - `id`: stable PolicyDecisionId.
 *   - `operation`: the kind of operation requested.
 *   - `requestedBy`: the actor or component making the request.
 *   - `inputs`: the inputs to the operation (for audit).
 *   - `ruleEvaluations`: every rule that was evaluated, with outcome.
 *   - `outcome`: the aggregate decision. `deny` if ANY rule denies;
 *      `defer` if no rule denies but at least one defers and none allow;
 *      `allow` only if at least one rule allows AND no rule denies.
 *   - `reason`: human-readable summary.
 *   - `decidedAt`: ISO timestamp.
 */
export interface PolicyDecision {
    readonly id: PolicyDecisionId;
    readonly operation: PolicyOperationKind;
    readonly requestedBy: string;
    readonly inputs: Readonly<Record<string, unknown>>;
    readonly ruleEvaluations: readonly PolicyRuleEvaluation[];
    readonly outcome: PolicyDecisionOutcome;
    readonly reason: string;
    readonly decidedAt: string;
}
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
export declare function aggregateOutcomes(rules: readonly PolicyRuleEvaluation[]): PolicyDecisionOutcome;
/**
 * Returns true iff the PolicyDecision authorizes the operation.
 *
 * `defer` is NOT authorization — deferral requires explicit resolution.
 */
export declare function isPolicyAllowed(d: PolicyDecision): boolean;
/**
 * Returns true iff the PolicyDecision hard-denies the operation.
 */
export declare function isPolicyDenied(d: PolicyDecision): boolean;
//# sourceMappingURL=policy-decision.d.ts.map