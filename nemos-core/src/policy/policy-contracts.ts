/**
 * Nemons Policy — Rule Contracts
 *
 * Defines the interface that every policy rule MUST implement.
 *
 * A PolicyRule:
 *   - is keyed by `ruleId` (stable string)
 *   - declares which operations it applies to
 *   - takes a `PolicyEvaluationContext` and returns a `PolicyRuleEvaluation`
 *
 * Rules are PURE functions of their inputs — no side effects, no I/O.
 * All effects are produced by the engine in response to the decision.
 */

import type { PolicyOperationKind, PolicyRuleEvaluation } from "./policy-decision.js";

/**
 * The context passed to a PolicyRule for evaluation. Carries:
 *   - the operation kind
 *   - the inputs the operation was requested with
 *   - the runtime "subject" identity (who is requesting)
 *   - the asset (if any) the operation targets
 *   - any cross-cutting context the rule needs
 */
export interface PolicyEvaluationContext {
  readonly operation: PolicyOperationKind;
  readonly requestedBy: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  /**
   * The asset the operation targets, if any. The asset's lifecycle
   * status (kind) is encoded as `assetProvenanceKind`.
   */
  readonly assetProvenanceKind?: string;
  /**
   * The capability set the current adapter exposes, if relevant to
   * the operation (e.g., context_pack.include_candidate).
   */
  readonly availableCapabilities?: ReadonlySet<string>;
  /**
   * Free-form runtime context. Rules SHOULD avoid relying on this
   * for security-relevant decisions; rules SHOULD explicitly enumerate
   * the fields they need (above).
   */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * The interface every PolicyRule MUST implement.
 *
 * A rule:
 *   - declares `ruleId` and `description`
 *   - declares which operations it applies to
 *   - implements `evaluate(ctx)` returning a `PolicyRuleEvaluation`
 *
 * The `evaluate` function MUST be pure: deterministic, side-effect-free,
 * and total (must not throw on contract-valid inputs).
 */
export interface PolicyRule {
  readonly ruleId: string;
  readonly description: string;
  readonly appliesTo: readonly PolicyOperationKind[];
  evaluate(ctx: PolicyEvaluationContext): PolicyRuleEvaluation;
}

/**
 * A registry of PolicyRules, keyed by ruleId. Used by the PolicyEngine
 * to look up applicable rules for an operation.
 */
export interface PolicyRuleRegistry {
  /**
   * Returns the rules that apply to the given operation kind.
   */
  rulesFor(operation: PolicyOperationKind): readonly PolicyRule[];
  /**
   * Lists all registered rules (for audit).
   */
  listAll(): readonly PolicyRule[];
}

/**
 * A simple in-memory PolicyRuleRegistry.
 */
export class InMemoryPolicyRuleRegistry implements PolicyRuleRegistry {
  private readonly rules = new Map<string, PolicyRule>();

  register(rule: PolicyRule): void {
    if (this.rules.has(rule.ruleId)) {
      throw new Error(`PolicyRule already registered: ${rule.ruleId}`);
    }
    this.rules.set(rule.ruleId, rule);
  }

  rulesFor(operation: PolicyOperationKind): readonly PolicyRule[] {
    return [...this.rules.values()].filter((r) => r.appliesTo.includes(operation));
  }

  listAll(): readonly PolicyRule[] {
    return [...this.rules.values()];
  }
}
