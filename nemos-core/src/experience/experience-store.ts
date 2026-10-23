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

import type { Experience } from "../schemas/experience.js";
import { validateExperience, isExperienceApproved } from "../schemas/experience.js";
import type { ExperienceId } from "../core/identifiers.js";
import {
  ContractValidationError,
  LifecycleViolationError,
} from "../core/errors.js";
import {
  isTransitionAllowed,
  transitionProvenance,
} from "../core/lifecycle.js";
import type { ProvenanceKind, ReviewEntry } from "../core/provenance.js";

/**
 * The ExperienceStore interface.
 */
export interface ExperienceStore {
  /**
   * Adds a new Experience record to the store. The Experience's
   * provenance MUST be `observed` (initial kind). Use `promote` to
   * change the kind later.
   *
   * Throws if the Experience is not `observed` (a contract violation —
   * the store is the entry point for new records, not for promotion).
   */
  add(experience: Experience): Experience;

  /**
   * Retrieves an Experience by id. Returns `undefined` when not found.
   * The returned Experience preserves its lifecycle kind (retrieved
   * is not approved).
   */
  get(id: ExperienceId): Experience | undefined;

  /**
   * Lists all Experience records in the store. The order is
   * insertion order (stable).
   */
  list(): readonly Experience[];

  /**
   * Promotes an Experience from one lifecycle kind to another.
   *
   * Throws `LifecycleViolationError` if the transition is not allowed
   * by the lifecycle state machine.
   *
   * Returns the promoted Experience. The original record is replaced
   * in the store (the store treats this as a controlled mutation).
   */
  promote(
    id: ExperienceId,
    toKind: ProvenanceKind,
    reviewEntry: Omit<ReviewEntry, "from" | "to">,
  ): Experience;

  /**
   * Returns the number of records in the store.
   */
  size(): number;
}

/**
 * Default in-memory ExperienceStore implementation.
 *
 * Records are keyed by their `id`. The store validates each record
 * on add (defense in depth against tampering at the boundary).
 *
 * Promotion is the only sanctioned mutation; the store applies the
 * lifecycle state machine via `transitionProvenance`.
 */
export class InMemoryExperienceStore implements ExperienceStore {
  private readonly records = new Map<ExperienceId, Experience>();
  private readonly insertionOrder: ExperienceId[] = [];

  add(experience: Experience): Experience {
    // Re-validate the Experience at the boundary
    validateExperience(experience);

    // The store is the entry point for NEW records. They MUST start
    // as `observed`. Promotion is the only way to change kind.
    if (experience.provenance.kind !== "observed") {
      throw new ContractValidationError(
        `Cannot add Experience with non-observed provenance kind: ${experience.provenance.kind}. ` +
          `New records MUST start as observed; use promote() to advance the lifecycle.`,
        {
          details: {
            experienceId: experience.id,
            provenanceKind: experience.provenance.kind,
          },
        },
      );
    }

    if (this.records.has(experience.id)) {
      throw new ContractValidationError(
        `Experience already exists: ${experience.id}`,
        { details: { experienceId: experience.id } },
      );
    }

    // Store a defensive copy (so external mutation does not corrupt the store)
    const stored: Experience = { ...experience };
    this.records.set(stored.id, stored);
    this.insertionOrder.push(stored.id);
    return stored;
  }

  get(id: ExperienceId): Experience | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    // Return a defensive copy (so external mutation does not corrupt the store)
    return { ...record };
  }

  list(): readonly Experience[] {
    return this.insertionOrder
      .map((id) => this.records.get(id))
      .filter((r): r is Experience => r !== undefined)
      .map((r) => ({ ...r }));
  }

  promote(
    id: ExperienceId,
    toKind: ProvenanceKind,
    reviewEntry: Omit<ReviewEntry, "from" | "to">,
  ): Experience {
    const current = this.records.get(id);
    if (!current) {
      throw new ContractValidationError(
        `Cannot promote: Experience not found: ${id}`,
        { details: { experienceId: id } },
      );
    }

    const fromKind = current.provenance.kind;

    // Check the transition is allowed
    if (!isTransitionAllowed(fromKind, toKind)) {
      throw new LifecycleViolationError(
        `Illegal Experience transition: ${fromKind} → ${toKind}`,
        {
          details: { experienceId: id, from: fromKind, to: toKind },
        },
      );
    }

    // Apply the transition via the lifecycle module (append-only trail)
    const newProvenanceState = transitionProvenance(
      { kind: fromKind, reviewTrail: current.provenance.reviewTrail },
      toKind,
      reviewEntry,
    );

    const updated: Experience = {
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

  size(): number {
    return this.records.size;
  }
}

/**
 * Convenience helper: returns true iff the store contains an approved
 * Experience with the given id.
 */
export function isExperienceApprovedInStore(
  store: ExperienceStore,
  id: ExperienceId,
): boolean {
  const e = store.get(id);
  return e !== undefined && isExperienceApproved(e);
}
