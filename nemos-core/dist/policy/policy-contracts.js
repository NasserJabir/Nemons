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
/**
 * A simple in-memory PolicyRuleRegistry.
 */
export class InMemoryPolicyRuleRegistry {
    rules = new Map();
    register(rule) {
        if (this.rules.has(rule.ruleId)) {
            throw new Error(`PolicyRule already registered: ${rule.ruleId}`);
        }
        this.rules.set(rule.ruleId, rule);
    }
    rulesFor(operation) {
        return [...this.rules.values()].filter((r) => r.appliesTo.includes(operation));
    }
    listAll() {
        return [...this.rules.values()];
    }
}
//# sourceMappingURL=policy-contracts.js.map