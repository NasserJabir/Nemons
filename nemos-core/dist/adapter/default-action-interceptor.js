/**
 * Nemons Adapter — Default Action Interceptor
 *
 * The DefaultActionInterceptor performs DETERMINISTIC checks only:
 *   1. Persona constraints (mustNot patterns)
 *   2. Estimated impact (destructive → deny unless explicitly allowed)
 *   3. Custom verifiers (additional deterministic checks)
 *
 * LLM-based probabilistic verification is deferred (per the
 * non-negotiable principle: "Never let a probabilistic model or
 * verifier override deterministic authorization, security controls,
 * or hard-deny rules.")
 *
 * Research source: Mid-Harness (https://arxiv.org/abs/2609.39982)
 */
/**
 * Default ActionInterceptor implementation.
 *
 * Checks (in order):
 *   1. Persona mustNot patterns → deny if the action's command matches.
 *   2. Destructive impact → deny if `denyDestructiveByDefault` is true.
 *   3. Custom verifiers → first non-undefined verdict wins.
 *   4. Otherwise → allow.
 *
 * All checks are DETERMINISTIC (no LLM, no probabilistic verification).
 */
export class DefaultActionInterceptor {
    persona;
    denyDestructive;
    customVerifiers;
    constructor(options = {}) {
        this.persona = options.persona;
        this.denyDestructive = options.denyDestructiveByDefault ?? true;
        this.customVerifiers = options.customVerifiers ?? [];
    }
    verifyAction(action) {
        // 1. Persona mustNot patterns
        if (this.persona?.constraints?.mustNot) {
            for (const pattern of this.persona.constraints.mustNot) {
                if (this.matchesPattern(action, pattern)) {
                    return {
                        kind: "deny",
                        reason: `Action matches Persona mustNot pattern: "${pattern}"`,
                    };
                }
            }
        }
        // 2. Destructive impact
        if (this.denyDestructive && action.estimatedImpact === "destructive") {
            return {
                kind: "deny",
                reason: `Action has destructive estimated impact and denyDestructiveByDefault is true.`,
            };
        }
        // 3. Custom verifiers
        for (const verifier of this.customVerifiers) {
            const verdict = verifier(action);
            if (verdict !== undefined) {
                return verdict;
            }
        }
        // 4. Allow
        return { kind: "allow" };
    }
    /**
     * Checks if an action matches a mustNot pattern.
     * The pattern is a simple substring match on the command + args.
     */
    matchesPattern(action, pattern) {
        const commandStr = [action.command, ...(action.args ?? [])].join(" ");
        return commandStr.includes(pattern);
    }
}
/**
 * Convenience helper: returns true iff the verdict is "allow".
 */
export function isActionAllowed(verdict) {
    return verdict.kind === "allow";
}
/**
 * Convenience helper: returns true iff the verdict is "deny".
 */
export function isActionDenied(verdict) {
    return verdict.kind === "deny";
}
//# sourceMappingURL=default-action-interceptor.js.map