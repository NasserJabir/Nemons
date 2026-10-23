/**
 * Nemons Persistence — Persistent Evidence Store
 *
 * The PersistentEvidenceStore wraps a `PersistentStore<Evidence>` to
 * persist Evidence records to disk. Records survive restart with
 * their content hashes preserved.
 *
 * Architectural principles enforced here:
 *   - "Evidence before claims": Evidence records with mismatched
 *     content hashes are detected as `corrupt` on read; they cannot
 *     be used to support a verified-succeeded claim.
 *   - "No silent mutation": the Evidence's `verified` flag is
 *     preserved on read; a `false` flag stays `false`.
 *   - "An incomplete record is not a verified success": an Evidence
 *     that fails validation OR has a hash mismatch is quarantined
 *     and reported via `getWithStatus`.
 *
 * Stage G: this store covers the Evidence-side of the persistent
 * Run + Evidence pair. Together with PersistentRunStore and
 * CrossReferenceChecker, the chain Run → Evidence → Evaluation →
 * Experience → Candidate becomes reconstructable after restart.
 */

import type { Evidence } from "../schemas/evidence.js";
import {
  validateEvidence,
  verifyInlineEvidence,
} from "../schemas/evidence.js";
import type { EvidenceId, RunId } from "../core/identifiers.js";
import {
  ContractValidationError,
} from "../core/errors.js";
import type {
  PersistentStore,
  HealthCheckReport,
} from "./persistence-contract.js";

/**
 * A validator function for Evidence records. Validates the schema
 * AND verifies the content hash of inline-payload Evidence.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration.
 */
export function evidenceValidator(record: unknown): asserts record is Evidence {
  validateEvidence(record);
  // Extra check: if the Evidence has an inlinePayload, the content
  // hash MUST match. A mismatch here means the Evidence was tampered
  // with on disk (or the writer computed the hash wrong).
  const e = record as Evidence;
  if (e.artifact.inlinePayload !== undefined) {
    if (!verifyInlineEvidence(e)) {
      throw new Error(
        `Evidence integrity violation: inline payload does not hash to the recorded contentHash ` +
          `(evidenceId=${e.id}, expected=${e.artifact.contentHash})`,
      );
    }
  }
}

/**
 * The PersistentEvidenceStore. Persists Evidence records to disk.
 *
 * Key behavior:
 *   - `add()` validates the schema AND verifies the content hash of
 *     inline-payload Evidence at the boundary.
 *   - `get()` returns `undefined` for both missing AND corrupt records
 *     (use `getWithStatus` for the full status).
 *   - The `verified` flag is preserved on read — retrieval does NOT
 *     silently mark Evidence as verified.
 */
export class PersistentEvidenceStore {
  constructor(
    private readonly backend: PersistentStore<Evidence & { id: string }>,
  ) {}

  /**
   * Initializes the underlying PersistentStore. Must be called
   * before any other operation.
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
   * Adds (or replaces) an Evidence record. The Evidence is validated
   * AND its content hash is verified at the boundary.
   *
   * Throws `ContractValidationError` (via `evidenceValidator`) if:
   *   - The schema is invalid
   *   - The inline-payload content hash does not match
   */
  async add(evidence: Evidence): Promise<Evidence> {
    // The validator runs schema validation + content hash verification
    evidenceValidator(evidence);
    await this.backend.add(evidence as Evidence & { id: string });
    return evidence;
  }

  /**
   * Loads an Evidence by id. Returns `undefined` when missing OR
   * when the record is corrupt (failed schema validation or content
   * hash mismatch on disk).
   *
   * Use `getWithStatus` for the full load result.
   */
  async get(id: EvidenceId): Promise<Evidence | undefined> {
    const result = await this.backend.get(id);
    if (result.kind === "ok") {
      return result.record;
    }
    return undefined;
  }

  /**
   * Loads an Evidence by id, returning the full status (ok / missing /
   * corrupt).
   *
   * For corrupt records, the `reason` field records WHY the record
   * was quarantined (e.g., "Content hash mismatch" or "Schema
   * validation failed").
   */
  async getWithStatus(
    id: EvidenceId,
  ): Promise<
    | { readonly kind: "ok"; readonly record: Evidence }
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
   * Lists all healthy Evidence records (corrupt ones are excluded).
   */
  async list(): Promise<readonly Evidence[]> {
    const envelopes = await this.backend.list();
    return envelopes.map((e) => e.record);
  }

  /**
   * Lists all Evidence records that reference a given Run (by runId).
   *
   * This is the canonical query for "find all Evidence for Run X" —
   * used by the CrossReferenceChecker and by ExperienceDeriver when
   * reconstructing the chain after restart.
   */
  async listByRunId(runId: RunId): Promise<readonly Evidence[]> {
    const all = await this.list();
    return all.filter((e) => e.runId === runId);
  }

  /**
   * Lists all Evidence records of a given kind (e.g., all
   * `verification_report` records).
   */
  async listByKind(kind: Evidence["kind"]): Promise<readonly Evidence[]> {
    const all = await this.list();
    return all.filter((e) => e.kind === kind);
  }

  /**
   * Lists all Evidence records that have been verified (verified=true).
   * Useful for the EvaluationEngine to find verified Evidence matching
   * a criterion.
   */
  async listVerified(): Promise<readonly Evidence[]> {
    const all = await this.list();
    return all.filter((e) => e.verified);
  }

  /**
   * Marks an Evidence as verified (after external verification for
   * URI-backed Evidence, or after a successful `verifyInlineEvidence`
   * call for inline-payload Evidence).
   *
   * The update is persisted: a new instance of the store loading the
   * same backend will see the verified flag.
   */
  async markVerified(id: EvidenceId): Promise<Evidence> {
    const result = await this.backend.get(id);
    if (result.kind === "missing") {
      throw new ContractValidationError(
        `Cannot mark verified: Evidence not found: ${id}`,
        { details: { evidenceId: id } },
      );
    }
    if (result.kind === "corrupt") {
      throw new ContractValidationError(
        `Cannot mark verified: Evidence is corrupt: ${id}`,
        { details: { evidenceId: id, reason: result.reason } },
      );
    }

    const current = result.record;
    if (current.verified) {
      // Already verified — no-op
      return current;
    }

    // For inline-payload Evidence, verify the hash before marking verified
    if (current.artifact.inlinePayload !== undefined) {
      if (!verifyInlineEvidence(current)) {
        throw new ContractValidationError(
          `Cannot mark verified: inline payload does not hash to the recorded contentHash`,
          { details: { evidenceId: id } },
        );
      }
    }

    const updated: Evidence = {
      ...current,
      verified: true,
    };

    evidenceValidator(updated);
    await this.backend.add(updated as Evidence & { id: string });
    return updated;
  }

  /**
   * Returns the count of healthy Evidence records.
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
   * Lists quarantined records.
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

  /**
   * Deletes an Evidence by id. Returns true if deleted.
   */
  async delete(id: EvidenceId): Promise<boolean> {
    return this.backend.delete(id);
  }
}
