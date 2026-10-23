/**
 * Nemons Adapter — Registry
 *
 * The AdapterRegistry is the runtime's catalog of available adapters.
 * Only registered adapters can be invoked; requests for unregistered
 * adapters MUST hard-fail (`AdapterUnavailableError`).
 *
 * Architectural principles enforced here:
 *   - "Explicit boundaries": there is no implicit "default adapter".
 *     The runtime MUST refuse to invoke an adapter that has not been
 *     explicitly registered.
 *   - "Agent independence": the registry is keyed by `AdapterKind`, a
 *     stable string. Switching Coding Agents is a registration change,
 *     not a Core change.
 */
import type { AdapterContract, AdapterKind } from "./adapter-contract.js";
/**
 * The AdapterRegistry interface.
 */
export interface AdapterRegistry {
    register(adapter: AdapterContract): void;
    get(kind: AdapterKind): AdapterContract;
    has(kind: AdapterKind): boolean;
    listKinds(): readonly AdapterKind[];
}
/**
 * The default in-memory AdapterRegistry.
 *
 * Hard-deny behavior: `get(kind)` throws `AdapterUnavailableError`
 * when the kind is not registered. There is no implicit fallback to
 * a "default adapter" — that would violate the explicit-boundaries
 * principle.
 */
export declare class InMemoryAdapterRegistry implements AdapterRegistry {
    private readonly adapters;
    register(adapter: AdapterContract): void;
    get(kind: AdapterKind): AdapterContract;
    has(kind: AdapterKind): boolean;
    listKinds(): readonly AdapterKind[];
}
//# sourceMappingURL=adapter-registry.d.ts.map