/**
 * Nemons Governed Evolution — Decision Log
 *
 * The DecisionLog records every approval, rejection, supersede, and
 * conflict-resolution decision for audit purposes. It is the canonical
 * audit trail for Stage H's "preserve decision log and rejection
 * reasons" requirement.
 *
 * Architectural principles enforced here:
 *   - "Preserve decision log and rejection reasons": every decision
 *     is recorded with actor, reason, and timestamp. Decisions are
 *     append-only (no deletion, no mutation).
 *   - "No silent mutation": the log is immutable. Entries can be
 *     added and read, but never modified or removed.
 *   - "Auditable": the log supports queries by candidate, by asset,
 *     and by kind, enabling full audit reconstruction.
 *
 * The DecisionLog is DISTINCT from a CandidateRecord's `reviewTrail`:
 *   - The reviewTrail is per-candidate, recording the lifecycle
 *     transitions of THAT candidate.
 *   - The DecisionLog is global, recording EVERY decision across ALL
 *     candidates, including conflict resolutions that may span
 *     multiple candidates.
 *
 * Both are kept for defense in depth: the reviewTrail provides
 * per-candidate audit; the DecisionLog provides cross-candidate audit.
 */
import type { CandidateId } from "../core/identifiers.js";
import type { ConflictResult } from "./conflict-detector.js";
/**
 * The kind of decision recorded.
 */
export type DecisionKind = "approval" | "rejection" | "request_changes" | "supersede" | "conflict_resolution" | "rollback" | "stale_baseline_rejection";
/**
 * A single decision log entry.
 *
 * Field invariants:
 *   - `id`: stable, unique entry id.
 *   - `at`: ISO timestamp.
 *   - `kind`: the decision kind.
 *   - `actor`: who made the decision (reviewer, approver, system).
 *   - `candidateId`: the candidate the decision is about (if applicable).
 *   - `oldCandidateId`: for supersedes, the candidate being superseded.
 *   - `newCandidateId`: for supersedes, the candidate replacing the old.
 *   - `assetId`: the asset the candidate targets (for asset-level queries).
 *   - `reason`: the human-readable reason for the decision.
 *   - `conflict`: the conflict result (for conflict_resolution and
 *     stale_baseline_rejection kinds).
 */
export interface DecisionLogEntry {
    readonly id: string;
    readonly at: string;
    readonly kind: DecisionKind;
    readonly actor: string;
    readonly candidateId?: CandidateId;
    readonly oldCandidateId?: CandidateId;
    readonly newCandidateId?: CandidateId;
    readonly assetId?: string;
    readonly reason: string;
    readonly conflict?: ConflictResult;
}
/**
 * The DecisionLog interface.
 */
export interface DecisionLog {
    /**
     * Records a new decision entry. The entry's id and timestamp are
     * minted by the log (not the caller). Returns the recorded entry.
     */
    record(input: Omit<DecisionLogEntry, "id" | "at">): DecisionLogEntry;
    /**
     * Lists all entries in insertion order.
     */
    list(): readonly DecisionLogEntry[];
    /**
     * Lists entries for a specific candidate (either as the candidateId,
     * oldCandidateId, or newCandidateId).
     */
    listForCandidate(candidateId: CandidateId): readonly DecisionLogEntry[];
    /**
     * Lists entries for a specific asset (by assetId).
     */
    listForAsset(assetId: string): readonly DecisionLogEntry[];
    /**
     * Lists entries of a specific kind.
     */
    listByKind(kind: DecisionKind): readonly DecisionLogEntry[];
    /**
     * Returns the count of entries.
     */
    size(): number;
}
/**
 * Default in-memory DecisionLog implementation.
 *
 * Entries are stored in insertion order. The log is append-only:
 * `record` is the only mutation operation; `list*` are read-only.
 *
 * Persistence: a persistent DecisionLog would wrap a PersistentStore
 * (same pattern as PersistentExperienceStore). For Stage H baseline,
 * the in-memory log satisfies the contract surface.
 */
export declare class InMemoryDecisionLog implements DecisionLog {
    private readonly entries;
    record(input: Omit<DecisionLogEntry, "id" | "at">): DecisionLogEntry;
    list(): readonly DecisionLogEntry[];
    listForCandidate(candidateId: CandidateId): readonly DecisionLogEntry[];
    listForAsset(assetId: string): readonly DecisionLogEntry[];
    listByKind(kind: DecisionKind): readonly DecisionLogEntry[];
    size(): number;
}
//# sourceMappingURL=decision-log.d.ts.map