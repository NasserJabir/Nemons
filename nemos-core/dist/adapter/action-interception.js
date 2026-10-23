/**
 * Nemons Adapter — Action Interception
 *
 * Extends the AdapterContract with an OPTIONAL action-interception
 * mechanism (ADR-0016, from Mid-Harness research).
 *
 * Architectural principles enforced here:
 *   - "Hard-deny security" (ADR-0003): actions denied by default if
 *     they violate constraints. The interceptor is ADDITIONAL to the
 *     policy engine, not a replacement.
 *   - "Deterministic authorization independent of probabilistic
 *     verification": the interceptor performs DETERMINISTIC checks
 *     only (Persona mustNot, estimated impact, skill capabilities).
 *     LLM-based probabilistic verification is deferred.
 *   - "Backward-compatible": interception is opt-in via
 *     `invokeWithInterception()`. Existing adapters work as before.
 *
 * Research source: Mid-Harness (https://arxiv.org/abs/2609.39982)
 * "Pre-execution action verification raises Pass@1 from 50% to 68%."
 */
export {};
//# sourceMappingURL=action-interception.js.map