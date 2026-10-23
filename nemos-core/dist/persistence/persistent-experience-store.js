/**
 * Nemons Persistence — PersistentExperienceStore
 *
 * Wraps a `PersistentStore<Experience>` to implement the `ExperienceStore`
 * interface. This is a drop-in replacement for `InMemoryExperienceStore`:
 * records survive restart, integrity is verified on load, and corrupt
 * records are quarantined (not silently dropped).
 *
 * Architectural principles enforced here:
 *   - "Records survive restart": backed by `PersistentStore`, records
 *     are loaded from disk on `initialize()`.
 *   - "No silent mutation": the lifecycle state machine is preserved
 *     across restarts — an `observed` record on disk stays `observed`
 *     when loaded; promote() persists the new kind.
 *   - "Retrieved is not approved": the store preserves the provenance
 *     kind on read; a record retrieved as `observed` is still `observed`.
 *   - "Failure handling": corrupt records are quarantined by the
 *     underlying PersistentStore; the wrapper surfaces them via the
 *     health-check report and `listQuarantine`.
 */
import { validateExperience } from "../schemas/experience.js";
import { isTransitionAllowed, transitionProvenance, } from "../core/lifecycle.js";
import { ContractValidationError, LifecycleViolationError, } from "../core/errors.js";
/**
 * The PersistentExperienceStore. Implements the `ExperienceStore`
 * interface (so it's a drop-in replacement for InMemoryExperienceStore).
 *
 * All operations are async (the underlying PersistentStore is async).
 *
 * Note: the ExperienceStore interface in `experience-store.ts` has
 * synchronous methods; we expose async equivalents here. Callers that
 * need a sync interface should use `InMemoryExperienceStore`.
 */
export class PersistentExperienceStore {
    backend;
    // We can't implement ExperienceStore directly because its methods are
    // sync. We expose async equivalents instead. Callers that need a sync
    // interface should use InMemoryExperienceStore.
    constructor(backend) {
        this.backend = backend;
    }
    /**
     * Initializes the underlying PersistentStore. Must be called before
     * any other operation.
     */
    async initialize() {
        // The backend may need initialization (e.g., FileSystemStore creates
        // directories). We delegate to the backend if it has an initialize
        // method; otherwise, this is a no-op.
        const maybeInit = this.backend;
        if (typeof maybeInit.initialize === "function") {
            await maybeInit.initialize();
        }
    }
    /**
     * Adds (or replaces) an Experience. The Experience MUST start as
     * `observed` (the same constraint as InMemoryExperienceStore).
     *
     * Throws if the Experience is not `observed` or fails validation.
     */
    async add(experience) {
        // Re-validate at the boundary
        validateExperience(experience);
        if (experience.provenance.kind !== "observed") {
            throw new ContractValidationError(`Cannot add Experience with non-observed provenance kind: ${experience.provenance.kind}.`, {
                details: {
                    experienceId: experience.id,
                    provenanceKind: experience.provenance.kind,
                },
            });
        }
        // Persist
        await this.backend.add(experience);
        return experience;
    }
    /**
     * Loads an Experience by id. Returns `undefined` when missing OR when
     * the record is corrupt (the corruption is recorded in the health
     * check report; the caller can call `listQuarantine` to inspect).
     *
     * This differs from the sync ExperienceStore which returns `undefined`
     * only for truly missing records. Here, corrupt records also return
     * `undefined` to preserve the interface contract.
     *
     * Use `getWithStatus` for the full load result (ok / missing / corrupt).
     */
    async get(id) {
        const result = await this.backend.get(id);
        if (result.kind === "ok") {
            return result.record;
        }
        return undefined;
    }
    /**
     * Loads an Experience by id, returning the full status (ok / missing /
     * corrupt). Use this when the caller needs to distinguish between
     * truly missing records and corrupt ones.
     */
    async getWithStatus(id) {
        const result = await this.backend.get(id);
        if (result.kind === "ok") {
            return { kind: "ok", record: result.record };
        }
        if (result.kind === "missing") {
            return { kind: "missing" };
        }
        return { kind: "corrupt", reason: result.reason };
    }
    /**
     * Lists all healthy Experiences (corrupt ones are excluded; they're
     * in the quarantine). The order is undefined (the underlying store
     * decides; FileSystemStore returns filesystem order).
     */
    async list() {
        const envelopes = await this.backend.list();
        return envelopes.map((e) => e.record);
    }
    /**
     * Promotes an Experience from one lifecycle kind to another. The
     * promotion is persisted: a new instance of the store loading the
     * same backend will see the promoted kind.
     *
     * Throws `LifecycleViolationError` for forbidden transitions.
     * Throws `ContractValidationError` if the Experience is not found.
     */
    async promote(id, toKind, reviewEntry) {
        const result = await this.backend.get(id);
        if (result.kind === "missing") {
            throw new ContractValidationError(`Cannot promote: Experience not found: ${id}`, { details: { experienceId: id } });
        }
        if (result.kind === "corrupt") {
            throw new ContractValidationError(`Cannot promote: Experience is corrupt (quarantined): ${id}. Reason: ${result.reason}`, { details: { experienceId: id, reason: result.reason } });
        }
        const current = result.record;
        const fromKind = current.provenance.kind;
        if (!isTransitionAllowed(fromKind, toKind)) {
            throw new LifecycleViolationError(`Illegal Experience transition: ${fromKind} → ${toKind}`, {
                details: { experienceId: id, from: fromKind, to: toKind },
            });
        }
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
        await this.backend.add(updated);
        return updated;
    }
    /**
     * Returns the count of healthy records.
     */
    async size() {
        return this.backend.size();
    }
    /**
     * Runs a health check on the underlying store. Returns the report.
     */
    async healthCheck() {
        return this.backend.healthCheck();
    }
    /**
     * Lists the ids of quarantined records.
     */
    async listQuarantine() {
        return this.backend.listQuarantine();
    }
    /**
     * Permanently removes all quarantined records. Returns the count.
     */
    async purgeQuarantine() {
        return this.backend.purgeQuarantine();
    }
}
/**
 * A validator function for Experience records. Used by FileSystemStore
 * to validate records on add and on read.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration (not an
 * arrow function assigned to a const).
 */
export function experienceValidator(record) {
    validateExperience(record);
}
//# sourceMappingURL=persistent-experience-store.js.map