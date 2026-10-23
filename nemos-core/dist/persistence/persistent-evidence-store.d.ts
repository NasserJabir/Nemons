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
import type { EvidenceId, RunId } from "../core/identifiers.js";
import type { PersistentStore, HealthCheckReport } from "./persistence-contract.js";
/**
 * A validator function for Evidence records. Validates the schema
 * AND verifies the content hash of inline-payload Evidence.
 *
 * NOTE: TypeScript assertions require the function declaration to use
 * the explicit `asserts` keyword in a function declaration.
 */
export declare function evidenceValidator(record: unknown): asserts record is Evidence;
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
export declare class PersistentEvidenceStore {
    private readonly backend;
    constructor(backend: PersistentStore<Evidence & {
        id: string;
    }>);
    /**
     * Initializes the underlying PersistentStore. Must be called
     * before any other operation.
     */
    initialize(): Promise<void>;
    /**
     * Adds (or replaces) an Evidence record. The Evidence is validated
     * AND its content hash is verified at the boundary.
     *
     * Throws `ContractValidationError` (via `evidenceValidator`) if:
     *   - The schema is invalid
     *   - The inline-payload content hash does not match
     */
    add(evidence: Evidence): Promise<Evidence>;
    /**
     * Loads an Evidence by id. Returns `undefined` when missing OR
     * when the record is corrupt (failed schema validation or content
     * hash mismatch on disk).
     *
     * Use `getWithStatus` for the full load result.
     */
    get(id: EvidenceId): Promise<Evidence | undefined>;
    /**
     * Loads an Evidence by id, returning the full status (ok / missing /
     * corrupt).
     *
     * For corrupt records, the `reason` field records WHY the record
     * was quarantined (e.g., "Content hash mismatch" or "Schema
     * validation failed").
     */
    getWithStatus(id: EvidenceId): Promise<{
        readonly kind: "ok";
        readonly record: Evidence;
    } | {
        readonly kind: "missing";
    } | {
        readonly kind: "corrupt";
        readonly reason: string;
    }>;
    /**
     * Lists all healthy Evidence records (corrupt ones are excluded).
     */
    list(): Promise<readonly Evidence[]>;
    /**
     * Lists all Evidence records that reference a given Run (by runId).
     *
     * This is the canonical query for "find all Evidence for Run X" —
     * used by the CrossReferenceChecker and by ExperienceDeriver when
     * reconstructing the chain after restart.
     */
    listByRunId(runId: RunId): Promise<readonly Evidence[]>;
    /**
     * Lists all Evidence records of a given kind (e.g., all
     * `verification_report` records).
     */
    listByKind(kind: Evidence["kind"]): Promise<readonly Evidence[]>;
    /**
     * Lists all Evidence records that have been verified (verified=true).
     * Useful for the EvaluationEngine to find verified Evidence matching
     * a criterion.
     */
    listVerified(): Promise<readonly Evidence[]>;
    /**
     * Marks an Evidence as verified (after external verification for
     * URI-backed Evidence, or after a successful `verifyInlineEvidence`
     * call for inline-payload Evidence).
     *
     * The update is persisted: a new instance of the store loading the
     * same backend will see the verified flag.
     */
    markVerified(id: EvidenceId): Promise<Evidence>;
    /**
     * Returns the count of healthy Evidence records.
     */
    size(): Promise<number>;
    /**
     * Runs a health check on the underlying store.
     */
    healthCheck(): Promise<HealthCheckReport>;
    /**
     * Lists quarantined records.
     */
    listQuarantine(): Promise<readonly {
        readonly id: string;
        readonly reason: string;
        readonly quarantinedAt: string;
    }[]>;
    /**
     * Permanently removes all quarantined records. Returns the count.
     */
    purgeQuarantine(): Promise<number>;
    /**
     * Deletes an Evidence by id. Returns true if deleted.
     */
    delete(id: EvidenceId): Promise<boolean>;
}
//# sourceMappingURL=persistent-evidence-store.d.ts.map