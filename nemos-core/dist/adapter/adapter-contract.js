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
/**
 * Predicate: does the adapter expose the named capability?
 */
export function adapterHasCapability(adapter, capability) {
    return adapter.getCapabilities().capabilities.has(capability);
}
/**
 * Predicate: does the adapter expose ALL named capabilities?
 */
export function adapterHasAllCapabilities(adapter, capabilities) {
    const caps = adapter.getCapabilities().capabilities;
    return capabilities.every((c) => caps.has(c));
}
//# sourceMappingURL=adapter-contract.js.map