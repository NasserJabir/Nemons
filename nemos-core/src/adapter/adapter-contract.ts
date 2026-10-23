/**
 * Nemons Adapter — Contract
 *
 * The AdapterContract is the replaceable integration boundary between
 * Nemons and an external Coding Agent / execution harness.
 *
 * Architectural principles enforced here:
 *   - "Agent independence": Nemons must not depend on a single Coding
 *     Agent's internal architecture. The contract is the only thing
 *     that touches the agent.
 *   - "Explicit boundaries": integrations pass through documented
 *     interfaces; the contract is the boundary.
 *   - Adapters do NOT redefine Nemons' domain semantics — they
 *     translate between the contract and the target agent's
 *     supported capabilities.
 *
 * The contract is intentionally minimal: a stable set of methods
 * every adapter MUST support, plus capability advertisement so the
 * Context Resolver can verify Skills are usable.
 */

import type { ContextPack } from "../schemas/context-pack.js";
import type { RunInputs, RunOutputs } from "../schemas/run.js";
import type { RunId } from "../core/identifiers.js";

/**
 * The kind of adapter — used to match Experience applicability and to
 * route requests to the right adapter via the registry.
 */
export type AdapterKind = string; // open-ended: "mock" | "openhands" | "cezar" | ...

/**
 * The capabilities an adapter advertises. Used by the Context Resolver
 * to verify that a Skill's `requiredCapabilities` are satisfied before
 * the Skill is included in a Context Pack.
 *
 * Capability names are runtime-defined strings. Examples:
 *   - "tool.file.write"
 *   - "tool.shell.exec"
 *   - "tool.git.diff"
 *   - "event.trace.full"
 */
export interface AdapterCapabilities {
  readonly capabilities: ReadonlySet<string>;
  /** A short, human-readable description of the adapter's surface. */
  readonly summary: string;
}

/**
 * The result of an adapter invocation. Carries the Run outputs and
 * (optionally) trace and artifact references for evidence collection.
 */
export interface AdapterInvocationResult {
  readonly runId: RunId;
  readonly outputs: RunOutputs;
  readonly traceRef?: string;
  readonly artifactRefs?: readonly string[];
  readonly adapterEvents?: readonly AdapterEvent[];
}

/**
 * An event emitted by the adapter during execution. Used as a source
 * of Evidence (e.g., "verification_report" or "adapter_event").
 */
export interface AdapterEvent {
  readonly kind: string;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * The minimal interface every adapter MUST implement.
 *
 * An adapter:
 *   - declares its `kind` (a stable string)
 *   - advertises its capabilities
 *   - invokes the underlying Coding Agent with a Context Pack + Run inputs
 *   - returns a result with outputs, trace, and artifacts
 *
 * Adapters MUST NOT mutate the Context Pack (it is treated as immutable
 * by the contract). Adapters MUST NOT silently approve any candidate
 * asset — they consume what the Context Pack Builder selected, and
 * the lifecycle status of each asset is preserved verbatim.
 */
export interface AdapterContract {
  readonly kind: AdapterKind;
  getCapabilities(): AdapterCapabilities;
  invoke(input: {
    readonly runId: RunId;
    readonly contextPack: ContextPack;
    readonly runInputs: RunInputs;
  }): Promise<AdapterInvocationResult>;

  /**
   * ADR-0016 (from Mid-Harness): does this adapter support action
   * interception? When true, the runtime can call
   * `invokeWithInterception()` instead of `invoke()` to get per-action
   * verification before execution.
   *
   * Default: false (backward-compatible).
   */
  readonly supportsActionInterception?: boolean;

  /**
   * ADR-0016: the intercepted invocation path. The adapter proposes
   * actions to the interceptor BEFORE executing them. The interceptor
   * returns an `ActionVerdict` (allow/deny/modify) for each action.
   *
   * Only implemented when `supportsActionInterception` is true.
   */
  invokeWithInterception?(input: {
    readonly runId: RunId;
    readonly contextPack: ContextPack;
    readonly runInputs: RunInputs;
    readonly interceptor: import("./action-interception.js").ActionInterceptor;
  }): Promise<AdapterInvocationResult>;
}

/**
 * Predicate: does the adapter expose the named capability?
 */
export function adapterHasCapability(
  adapter: AdapterContract,
  capability: string,
): boolean {
  return adapter.getCapabilities().capabilities.has(capability);
}

/**
 * Predicate: does the adapter expose ALL named capabilities?
 */
export function adapterHasAllCapabilities(
  adapter: AdapterContract,
  capabilities: readonly string[],
): boolean {
  const caps = adapter.getCapabilities().capabilities;
  return capabilities.every((c) => caps.has(c));
}
