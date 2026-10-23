/**
 * Nemons Experience — Store
 *
 * The ExperienceStore is the in-memory store for Experience records.
 *
 * Architectural principles enforced here:
 *   - "Retrieved is not approved": retrieval preserves the lifecycle
 *     kind. The store does NOT silently upgrade an `observed` record
 *     to `approved` on retrieval.
 *   - "No silent mutation": the store's `promote` operation is the
 *     ONLY sanctioned way to change an Experience's lifecycle kind,
 *     and it enforces the lifecycle state machine.
 *
 * Persistence is a Stage-E capability. This in-memory store satisfies
 * the contract surface for Stage D.
 */
import { validateExperience, isExperienceApproved } from "../schemas/experience.js";
import { ContractValidationError, LifecycleViolationError, } from "../core/errors.js";
import { isTransitionAllowed, transitionProvenance, } from "../core/lifecycle.js";
/**
 * Default in-memory ExperienceStore implementation.
 *
 * Records are keyed by their `id`. The store validates each record
 * on add (defense in depth against tampering at the boundary).
 *
 * Promotion is the only sanctioned mutation; the store applies the
 * lifecycle state machine via `transitionProvenance`.
 */
export class InMemoryExperienceStore {
    records = new Map();
    insertionOrder = [];
    add(experience) {
        // Re-validate the Experience at the boundary
        validateExperience(experience);
        // The store is the entry point for NEW records. They MUST start
        // as `observed`. Promotion is the only way to change kind.
        if (experience.provenance.kind !== "observed") {
            throw new ContractValidationError(`Cannot add Experience with non-observed provenance kind: ${experience.provenance.kind}. ` +
                `New records MUST start as observed; use promote() to advance the lifecycle.`, {
                details: {
                    experienceId: experience.id,
                    provenanceKind: experience.provenance.kind,
                },
            });
        }
        if (this.records.has(experience.id)) {
            throw new ContractValidationError(`Experience already exists: ${experience.id}`, { details: { experienceId: experience.id } });
        }
        // Store a defensive copy (so external mutation does not corrupt the store)
        const stored = { ...experience };
        this.records.set(stored.id, stored);
        this.insertionOrder.push(stored.id);
        return stored;
    }
    get(id) {
        const record = this.records.get(id);
        if (!record)
            return undefined;
        // Return a defensive copy (so external mutation does not corrupt the store)
        return { ...record };
    }
    list() {
        return this.insertionOrder
            .map((id) => this.records.get(id))
            .filter((r) => r !== undefined)
            .map((r) => ({ ...r }));
    }
    promote(id, toKind, reviewEntry) {
        const current = this.records.get(id);
        if (!current) {
            throw new ContractValidationError(`Cannot promote: Experience not found: ${id}`, { details: { experienceId: id } });
        }
        const fromKind = current.provenance.kind;
        // Check the transition is allowed
        if (!isTransitionAllowed(fromKind, toKind)) {
            throw new LifecycleViolationError(`Illegal Experience transition: ${fromKind} → ${toKind}`, {
                details: { experienceId: id, from: fromKind, to: toKind },
            });
        }
        // Apply the transition via the lifecycle module (append-only trail)
        const newProvenanceState = transitionProvenance({ kind: fromKind, reviewTrail: current.provenance.reviewTrail }, toKind, reviewEntry);
        const updated = {
            ...current,
            provenance: {
                ...current.provenance,
                kind: newProvenanceState.kind,
                reviewTrail: newProvenanceState.reviewTrail,
            },
        };
        validateExperience(updated);
        this.records.set(id, updated);
        return { ...updated };
    }
    size() {
        return this.records.size;
    }
}
/**
 * Convenience helper: returns true iff the store contains an approved
 * Experience with the given id.
 */
export function isExperienceApprovedInStore(store, id) {
    const e = store.get(id);
    return e !== undefined && isExperienceApproved(e);
}
//# sourceMappingURL=experience-store.js.map