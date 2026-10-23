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
import type { ProposedAction, ActionVerdict, ActionInterceptor } from "./action-interception.js";
import type { Persona } from "../schemas/persona.js";
/**
 * A deterministic verifier function. Returns a verdict for a proposed
 * action. MUST be pure (no side effects, no I/O).
 */
export type DeterministicActionVerifier = (action: ProposedAction) => ActionVerdict | undefined;
/**
 * Configuration for the DefaultActionInterceptor.
 */
export interface DefaultActionInterceptorOptions {
    /**
     * The Persona whose constraints are checked. If the action matches
     * a `mustNot` pattern, it's denied.
     */
    readonly persona?: Persona;
    /**
     * If true, destructive actions (estimatedImpact = "destructive")
     * are denied by default. Set to false to allow destructive actions.
     * Default: true (deny destructive by default).
     */
    readonly denyDestructiveByDefault?: boolean;
    /**
     * Additional deterministic verifiers. Each verifier is called in
     * order; the first non-undefined verdict wins.
     */
    readonly customVerifiers?: readonly DeterministicActionVerifier[];
}
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
export declare class DefaultActionInterceptor implements ActionInterceptor {
    private readonly persona?;
    private readonly denyDestructive;
    private readonly customVerifiers;
    constructor(options?: DefaultActionInterceptorOptions);
    verifyAction(action: ProposedAction): ActionVerdict;
    /**
     * Checks if an action matches a mustNot pattern.
     * The pattern is a simple substring match on the command + args.
     */
    private matchesPattern;
}
/**
 * Convenience helper: returns true iff the verdict is "allow".
 */
export declare function isActionAllowed(verdict: ActionVerdict): boolean;
/**
 * Convenience helper: returns true iff the verdict is "deny".
 */
export declare function isActionDenied(verdict: ActionVerdict): boolean;
//# sourceMappingURL=default-action-interceptor.d.ts.map