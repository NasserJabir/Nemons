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
import { AdapterUnavailableError } from "../core/errors.js";
/**
 * The default in-memory AdapterRegistry.
 *
 * Hard-deny behavior: `get(kind)` throws `AdapterUnavailableError`
 * when the kind is not registered. There is no implicit fallback to
 * a "default adapter" — that would violate the explicit-boundaries
 * principle.
 */
export class InMemoryAdapterRegistry {
    adapters = new Map();
    register(adapter) {
        if (this.adapters.has(adapter.kind)) {
            throw new Error(`Adapter already registered for kind: ${adapter.kind}`);
        }
        this.adapters.set(adapter.kind, adapter);
    }
    get(kind) {
        const adapter = this.adapters.get(kind);
        if (!adapter) {
            throw new AdapterUnavailableError(kind, `No adapter registered for kind: ${kind}`, { details: { registeredKinds: [...this.adapters.keys()] } });
        }
        return adapter;
    }
    has(kind) {
        return this.adapters.has(kind);
    }
    listKinds() {
        return [...this.adapters.keys()];
    }
}
//# sourceMappingURL=adapter-registry.js.map