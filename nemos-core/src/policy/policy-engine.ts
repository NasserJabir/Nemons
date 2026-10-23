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
import { aggregateOutcomes } from "./policy-decision.js";
import type { PolicyRuleRegistry, PolicyEvaluationContext } from "./policy-contracts.js";
import { asPolicyDecisionId, freshId } from "../core/identifiers.js";
import { PolicyDeniedError } from "../core/errors.js";

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
export class DefaultPolicyEngine implements PolicyEngine {
  constructor(private readonly registry: PolicyRuleRegistry) {}

  decide(ctx: PolicyEvaluationContext): PolicyDecision {
    const applicable = this.registry.rulesFor(ctx.operation);
    const evaluations = applicable.map((rule) => rule.evaluate(ctx));
    const outcome = aggregateOutcomes(evaluations);
    const reason = this.summarize(outcome, evaluations);
    return {
      id: asPolicyDecisionId(freshId()),
      operation: ctx.operation,
      requestedBy: ctx.requestedBy,
      inputs: ctx.inputs,
      ruleEvaluations: evaluations,
      outcome,
      reason,
      decidedAt: new Date().toISOString(),
    };
  }

  private summarize(
    outcome: PolicyDecision["outcome"],
    evaluations: readonly { ruleId: string; outcome: string; reason: string }[],
  ): string {
    if (outcome === "allow") {
      return `Allowed by ${evaluations.filter((e) => e.outcome === "allow").length} rule(s).`;
    }
    if (outcome === "deny") {
      const denying = evaluations.filter((e) => e.outcome === "deny");
      if (denying.length > 0) {
        return `Denied by: ${denying.map((d) => `${d.ruleId} (${d.reason})`).join("; ")}`;
      }
      return "Denied: no rule produced an explicit allow (default-deny).";
    }
    const deferring = evaluations.filter((e) => e.outcome === "defer");
    return `Deferred pending resolution: ${deferring.map((d) => d.ruleId).join(", ")}`;
  }
}

/**
 * Convenience helper: throws `PolicyDeniedError` when the decision is
 * NOT an allow. Callers should wrap any operation they perform with
 * this helper to ensure hard-deny behavior is enforced uniformly.
 */
export function enforceDecision(
  decision: PolicyDecision,
): void {
  if (decision.outcome !== "allow") {
    throw new PolicyDeniedError(decision.id, decision.reason, {
      details: {
        operation: decision.operation,
        outcome: decision.outcome,
        ruleEvaluations: decision.ruleEvaluations,
      },
    });
  }
}

// Re-export operation kind for convenience.
export type { PolicyOperationKind } from "./policy-decision.js";
