# ADR-0016 — Action Interception (from Mid-Harness research)

**Status:** Accepted  
**Date:** 2026-10-21  
**Decision Owner:** Project Owner (explicit authorization granted)  
**Research Source:** Mid-Harness: Scaling Actions Between Model and Harness for Terminal Agents (https://arxiv.org/abs/2609.39982)

## Context

Mid-Harness (Kang et al., Sep 2026) introduced pre-execution action verification: sampling and verifying candidate actions before forwarding one for execution. Key findings:

- Pre-execution verification raises **Pass@1 from 50% to 68%** with 8 sampled actions.
- A capable verifier can exploit useful alternatives from the same generator.
- The generator and harness remain unchanged — only the model-harness boundary is modified.

**Current gap:** Nemons' `AdapterContract.invoke()` is a single async call. The adapter executes blindly and reports back. There's no mechanism to:
1. Intercept individual actions before they're executed.
2. Verify proposed actions against constraints (Persona mustNot, Policy hard-deny, Skill capabilities).
3. Block unsafe actions before they corrupt the environment.

Without interception, Nemons can only REACT to failures (after the fact), not PREVENT them (before execution). This violates the "hard-deny security" principle (ADR-0003) at the action level — the policy can deny a Run, but it can't deny a specific action within a Run.

## Decision

Extend the `AdapterContract` with an **OPTIONAL** action-interception mechanism:

### New Types

**`ProposedAction`** — an action the adapter wants to execute:
- `kind`: "shell" | "file.read" | "file.write" | "git" | "test" | "other"
- `command?`: the command string (e.g., "npm test", "git diff")
- `args?`: readonly string[]
- `description`: human-readable description
- `estimatedImpact`: "read-only" | "write" | "destructive"

**`ActionVerdict`** — the interception result:
- `allow`: proceed with the action
- `deny`: block the action (with reason)
- `modify`: replace the action with a modified version

**`ActionInterceptor`** — the interface for verifying proposed actions:
- `verifyAction(action: ProposedAction): ActionVerdict`

### AdapterContract Extension

The `AdapterContract` gets two new optional fields:
- `supportsActionInterception?: boolean` — does this adapter support interception?
- `invokeWithInterception?(input, interceptor): Promise<AdapterInvocationResult>` — the intercepted invocation path

This is **backward-compatible**:
- Existing adapters (MockAdapter, LocalExecutionAdapter) work as before via `invoke()`.
- Adapters that support interception implement `invokeWithInterception()`.
- The runtime checks `supportsActionInterception` to decide which path to use.

### DefaultActionInterceptor

The `DefaultActionInterceptor` performs **DETERMINISTIC** checks only:
1. **Persona constraints** (`mustNot` rules) — if the action matches a `mustNot` pattern → deny.
2. **Estimated impact** — if `destructive` and the Persona doesn't allow destructive actions → deny.
3. **Skill capabilities** — if the action requires a capability the adapter doesn't advertise → deny.
4. **Custom verifiers** — additional deterministic checks registered by the caller.

### What This Does NOT Do

- Does NOT use an LLM for probabilistic verification (deferred — the paper uses LLM verifiers, but Nemons keeps verification deterministic per the architectural principle: "Never let a probabilistic model or verifier override deterministic authorization, security controls, or hard-deny rules.")
- Does NOT replace the policy engine (the interceptor is ADDITIONAL to the policy, not a replacement).
- Does NOT modify existing `invoke()` behavior (interception is opt-in via `invokeWithInterception()`).
- Does NOT require all adapters to support interception (backward-compatible).
- Does NOT weaken any existing test or authorization boundary.

### Benefit

- **Prevents unsafe actions** before execution (environment protection).
- **Enables policy enforcement at the action level** (not just the Run level).
- **Aligns with hard-deny security** (ADR-0003): actions denied by default if they violate constraints.
- **Research shows 50% → 68% improvement** in task success.

## Rationale

1. **Research-backed**: Mid-Harness shows 18pp improvement.
2. **Architecturally aligned**: extends hard-deny to the action level.
3. **Backward-compatible**: optional, opt-in.
4. **Deterministic only**: probabilistic verification deferred (per the non-negotiable principle).
5. **Explicitly authorized** by the project owner.

## Compliance

- All existing tests continue to pass (interception is opt-in).
- New tests verify the interception behavior.
- Deterministic authorization (policy engine) remains independent of the interceptor.
- The architectural invariants are preserved (the interceptor STRENGTHENS security, not weakens it).
