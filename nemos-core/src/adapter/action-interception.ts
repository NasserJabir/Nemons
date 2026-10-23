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

import type { ContextPack } from "../schemas/context-pack.js";
import type { RunInputs, RunOutputs } from "../schemas/run.js";
import type { RunId } from "../core/identifiers.js";

/**
 * The kind of action an adapter proposes to execute.
 */
export type ProposedActionKind =
  | "shell" // a shell command (e.g., npm test, git diff)
  | "file.read" // reading a file
  | "file.write" // writing/modifying a file
  | "git" // a git operation (commit, diff, checkout)
  | "test" // running a test suite
  | "other"; // any other action

/**
 * The estimated impact of a proposed action.
 *
 * - `read-only`: no side effects (e.g., reading a file, running tests).
 * - `write`: modifies files or state (e.g., writing a file, git commit).
 * - `destructive`: potentially irreversible (e.g., rm -rf, force push).
 */
export type EstimatedImpact = "read-only" | "write" | "destructive";

/**
 * A proposed action that the adapter wants to execute.
 *
 * The adapter proposes this action to the interceptor BEFORE executing
 * it. The interceptor returns an `ActionVerdict` (allow/deny/modify).
 */
export interface ProposedAction {
  readonly kind: ProposedActionKind;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly description: string;
  readonly estimatedImpact: EstimatedImpact;
}

/**
 * The interception verdict for a proposed action.
 *
 * - `allow`: proceed with the action as proposed.
 * - `deny`: block the action (with reason). The adapter should skip it.
 * - `modify`: replace the action with a modified version (with reason).
 */
export type ActionVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "modify"; readonly modifiedAction: ProposedAction; readonly reason: string };

/**
 * The interface for verifying proposed actions.
 *
 * Implementations perform DETERMINISTIC checks only:
 *   - Persona constraints (mustNot patterns)
 *   - Estimated impact (destructive → deny unless explicitly allowed)
 *   - Skill capabilities (action requires a capability the adapter doesn't advertise)
 *   - Custom verifiers (additional deterministic checks)
 *
 * LLM-based probabilistic verification is deferred (per the non-negotiable
 * principle: "Never let a probabilistic model or verifier override
 * deterministic authorization, security controls, or hard-deny rules.")
 */
export interface ActionInterceptor {
  verifyAction(action: ProposedAction): ActionVerdict;
}

/**
 * The input for `invokeWithInterception`.
 */
export interface InterceptionInvokeInput {
  readonly runId: RunId;
  readonly contextPack: ContextPack;
  readonly runInputs: RunInputs;
  readonly interceptor: ActionInterceptor;
}

/**
 * The result of an intercepted invocation (same as the non-intercepted result).
 */
export type InterceptionInvokeResult = {
  readonly runId: RunId;
  readonly outputs: RunOutputs;
  readonly traceRef?: string;
  readonly artifactRefs?: readonly string[];
  readonly adapterEvents?: readonly import("./adapter-contract.js").AdapterEvent[];
  /**
   * Actions that were DENIED by the interceptor (for audit).
   */
  readonly deniedActions?: readonly { readonly action: ProposedAction; readonly reason: string }[];
};
