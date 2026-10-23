/**
 * Nemons Persistence — Persistent Candidate Store
 *
 * Wraps a `PersistentStore<CandidateRecord>` to implement the
 * `CandidateStore` interface. Candidates survive restart: a new
 * instance at the same persistence location loads previously-written
 * candidates, with status, version chains, and review trails preserved.
 *
 * Architectural principles enforced here:
 *   - "Records survive restart": backed by `PersistentStore`.
 *   - "No silent mutation": candidates' status is preserved on read;
 *     promote via `transition()` is the only sanctioned way to change.
 *   - "Failure handling": corrupt candidates are quarantined by the
 *     underlying PersistentStore.
 *
 * This is the Stage E+F integration: governed evolution records now
 * survive restart, completing the persistent operational-knowledge
 * surface.
 */

import type {
  CandidateRecord,
  CandidateStatus,
} from "../schemas/candidate.js";
import {
  validateCandidateRecord,
  isCandidateTransitionAllowed,
  IllegalCandidateTransitionError,
} from "../schemas/candidate.js";
import type { CandidateId } from "../core/identifiers.js";
import {
  ContractValidationError,
} from "../core/errors.js";
import type { ReviewEntry } from "../core/provenance.js";
import type {
  PersistentStore,
  HealthCheckReport,
} from "./persistence-contract.js";

/**
 * A validator function for CandidateRecord. Used by FileSystemStore
 * to validate candidates on add and on read.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration.
 */
export function candidateValidator(
  record: unknown,
): asserts record is CandidateRecord {
  validateCandidateRecord(record);
}

/**
 * The PersistentCandidateStore. Implements the same interface surface
 * as `InMemoryCandidateStore`, but with persistence.
 *
 * Note: the InMemoryCandidateStore has sync methods; we expose async
 * equivalents here. Callers that need a sync interface should use
 * InMemoryCandidateStore.
 */
export class PersistentCandidateStore {
  constructor(
    private readonly backend: PersistentStore<CandidateRecord & { id: string }>,
  ) {}

  /**
   * Initializes the underlying PersistentStore. Must be called before
   * any other operation.
   */
  async initialize(): Promise<void> {
    const maybeInit = this.backend as unknown as {
      initialize?: () => Promise<void>;
    };
    if (typeof maybeInit.initialize === "function") {
      await maybeInit.initialize();
    }
  }

  /**
   * Adds a new CandidateRecord. The candidate's status MUST be
   * `proposed` (the initial status).
   *
   * Throws if the candidate is not `proposed` or fails validation.
   * Throws if the candidate's `supersedesCandidateId` does not exist
   * in the store.
   */
  async add(candidate: CandidateRecord): Promise<CandidateRecord> {
    // Re-validate at the boundary
    validateCandidateRecord(candidate);

    if (candidate.status !== "proposed") {
      throw new ContractValidationError(
        `Cannot add CandidateRecord with non-proposed status: ${candidate.status}.`,
        {
          details: {
            candidateId: candidate.id,
            status: candidate.status,
          },
        },
      );
    }

    // If supersedesCandidateId is set, verify it exists
    if (candidate.supersedesCandidateId !== undefined) {
      const superseded = await this.backend.get(candidate.supersedesCandidateId);
      if (superseded.kind === "missing") {
        throw new ContractValidationError(
          `Cannot add CandidateRecord: supersedesCandidateId ${candidate.supersedesCandidateId} does not exist.`,
          {
            details: {
              candidateId: candidate.id,
              supersedesCandidateId: candidate.supersedesCandidateId,
            },
          },
        );
      }
      if (superseded.kind === "corrupt") {
        throw new ContractValidationError(
          `Cannot add CandidateRecord: supersedesCandidateId ${candidate.supersedesCandidateId} is corrupt (quarantined).`,
          {
            details: {
              candidateId: candidate.id,
              supersedesCandidateId: candidate.supersedesCandidateId,
              reason: superseded.reason,
            },
          },
        );
      }
    }

    await this.backend.add(candidate as CandidateRecord & { id: string });
    return candidate;
  }

  /**
   * Loads a CandidateRecord by id. Returns `undefined` when missing
   * OR when the record is corrupt (the corruption is recorded in
   * the health check report).
   *
   * Use `getWithStatus` for the full load result (ok / missing / corrupt).
   */
  async get(id: CandidateId): Promise<CandidateRecord | undefined> {
    const result = await this.backend.get(id);
    if (result.kind === "ok") {
      return result.record;
    }
    return undefined;
  }

  /**
   * Loads a candidate by id, returning the full status (ok / missing / corrupt).
   */
  async getWithStatus(
    id: CandidateId,
  ): Promise<
    | { readonly kind: "ok"; readonly record: CandidateRecord }
    | { readonly kind: "missing" }
    | { readonly kind: "corrupt"; readonly reason: string }
  > {
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
   * Lists all healthy candidates (corrupt ones are excluded).
   */
  async list(): Promise<readonly CandidateRecord[]> {
    const envelopes = await this.backend.list();
    return envelopes.map((e) => e.record);
  }

  /**
   * Transitions a candidate from one status to another. The
   * transition is persisted: a new instance of the store loading
   * the same backend will see the new status.
   *
   * Throws `IllegalCandidateTransitionError` for forbidden transitions.
   * Throws `ContractValidationError` if the candidate is not found.
   */
  async transition(
    id: CandidateId,
    toStatus: CandidateStatus,
    reviewEntry: Omit<ReviewEntry, "from" | "to">,
  ): Promise<CandidateRecord> {
    const result = await this.backend.get(id);
    if (result.kind === "missing") {
      throw new ContractValidationError(
        `Cannot transition: CandidateRecord not found: ${id}`,
        { details: { candidateId: id } },
      );
    }
    if (result.kind === "corrupt") {
      throw new ContractValidationError(
        `Cannot transition: CandidateRecord is corrupt (quarantined): ${id}. Reason: ${result.reason}`,
        { details: { candidateId: id, reason: result.reason } },
      );
    }

    const current = result.record;
    const fromStatus = current.status;

    if (!isCandidateTransitionAllowed(fromStatus, toStatus)) {
      throw new IllegalCandidateTransitionError(fromStatus, toStatus);
    }

    const newReviewEntry: ReviewEntry = {
      ...reviewEntry,
      from: fromStatus as unknown as ReviewEntry["from"],
      to: toStatus as unknown as ReviewEntry["to"],
    };

    const updated: CandidateRecord = {
      ...current,
      status: toStatus,
      provenance: {
        ...current.provenance,
        reviewTrail: [...(current.provenance.reviewTrail ?? []), newReviewEntry],
      },
    };

    validateCandidateRecord(updated);
    await this.backend.add(updated as CandidateRecord & { id: string });
    return updated;
  }

  /**
   * Returns the version chain for an asset — the ordered list of
   * candidates that target the given assetId. The order is newest first.
   */
  async getVersionChain(assetId: string): Promise<readonly CandidateRecord[]> {
    const candidates = await this.list();
    const matching = candidates.filter((c) => c.assetId === assetId);
    if (matching.length === 0) return [];

    const supersededIds = new Set<CandidateId>();
    for (const c of matching) {
      if (c.supersedesCandidateId !== undefined) {
        supersededIds.add(c.supersedesCandidateId);
      }
    }

    const heads = matching.filter((c) => !supersededIds.has(c.id));
    if (heads.length === 0) {
      return [...matching].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
    }

    const newestHead = [...heads].sort(
      (a, b) => b.proposedAt.localeCompare(a.proposedAt),
    )[0]!;

    const chain: CandidateRecord[] = [newestHead];
    const byId = new Map<string, CandidateRecord>();
    for (const c of matching) byId.set(c.id, c);

    let current = newestHead;
    while (current.supersedesCandidateId !== undefined) {
      const prev = byId.get(current.supersedesCandidateId);
      if (!prev) break;
      chain.push(prev);
      current = prev;
    }

    return chain;
  }

  /**
   * Returns the latest approved candidate for an asset (the active
   * version). Returns `undefined` if no approved candidate exists.
   *
   * NOTE: a candidate with `supersedesCandidateId` set but status
   * `proposed` does NOT supersede the referenced candidate — the
   * supersede only takes effect when BOTH the superseder AND the
   * superseded are approved (the engine's `supersede` operation
   * is the canonical way to advance this).
   */
  async getActiveApproved(
    assetId: string,
  ): Promise<CandidateRecord | undefined> {
    const candidates = await this.list();
    const matching = candidates.filter((c) => c.assetId === assetId);
    const approved = matching.filter((c) => c.status === "approved");
    if (approved.length === 0) return undefined;

    // Build a lookup map first
    const byId = new Map<string, CandidateRecord>();
    for (const c of matching) byId.set(c.id, c);

    // Build the set of approved candidates that are superseded BY AN APPROVED CANDIDATE.
    // Only consider APPROVED candidates as valid superseders.
    const supersededApprovedIds = new Set<CandidateId>();
    for (const c of matching) {
      if (c.status === "approved" && c.supersedesCandidateId !== undefined) {
        const superseded = byId.get(c.supersedesCandidateId);
        if (superseded && superseded.status === "approved") {
          supersededApprovedIds.add(superseded.id);
        }
      }
    }

    const active = approved.filter((c) => !supersededApprovedIds.has(c.id));
    if (active.length === 0) return undefined;

    active.sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
    return { ...active[0]! };
  }

  /**
   * Returns the count of healthy candidates.
   */
  async size(): Promise<number> {
    return this.backend.size();
  }

  /**
   * Runs a health check on the underlying store.
   */
  async healthCheck(): Promise<HealthCheckReport> {
    return this.backend.healthCheck();
  }

  /**
   * Lists the ids of quarantined records.
   */
  async listQuarantine(): Promise<
    readonly { readonly id: string; readonly reason: string; readonly quarantinedAt: string }[]
  > {
    return this.backend.listQuarantine();
  }

  /**
   * Permanently removes all quarantined records. Returns the count.
   */
  async purgeQuarantine(): Promise<number> {
    return this.backend.purgeQuarantine();
  }
}
