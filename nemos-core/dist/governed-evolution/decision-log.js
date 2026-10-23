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
import { freshId } from "../core/identifiers.js";
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
export class InMemoryDecisionLog {
    entries = [];
    record(input) {
        const entry = {
            ...input,
            id: freshId(),
            at: new Date().toISOString(),
        };
        this.entries.push(entry);
        return { ...entry };
    }
    list() {
        return this.entries.map((e) => ({ ...e }));
    }
    listForCandidate(candidateId) {
        return this.entries
            .filter((e) => e.candidateId === candidateId ||
            e.oldCandidateId === candidateId ||
            e.newCandidateId === candidateId)
            .map((e) => ({ ...e }));
    }
    listForAsset(assetId) {
        return this.entries
            .filter((e) => e.assetId === assetId)
            .map((e) => ({ ...e }));
    }
    listByKind(kind) {
        return this.entries.filter((e) => e.kind === kind).map((e) => ({ ...e }));
    }
    size() {
        return this.entries.length;
    }
}
//# sourceMappingURL=decision-log.js.map