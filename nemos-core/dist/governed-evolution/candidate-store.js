/**
 * Nemons Governed Evolution — Candidate Store
 *
 * The CandidateStore is the in-memory store for CandidateRecord.
 * It supports version chain queries: given an assetId, return the
 * ordered list of candidates (newest first).
 *
 * Architectural principles enforced here:
 *   - "No silent mutation": the store's `transition` operation is
 *     the ONLY sanctioned way to change a candidate's status, and
 *     it enforces the candidate state machine.
 *   - "The process must preserve provenance, review decisions,
 *     version history": the store's `getVersionChain` returns the
 *     full history of candidates for an asset.
 *
 * Persistence is a Stage E capability; this in-memory store
 * satisfies the contract surface for Stage F. A persistent version
 * would wrap a PersistentStore<CandidateRecord>.
 */
import { validateCandidateRecord, isCandidateTransitionAllowed, IllegalCandidateTransitionError } from "../schemas/candidate.js";
import { ContractValidationError } from "../core/errors.js";
/**
 * Default in-memory CandidateStore implementation.
 */
export class InMemoryCandidateStore {
    records = new Map();
    insertionOrder = [];
    add(candidate) {
        validateCandidateRecord(candidate);
        // New candidates MUST start as `proposed`.
        if (candidate.status !== "proposed") {
            throw new ContractValidationError(`Cannot add CandidateRecord with non-proposed status: ${candidate.status}. ` +
                `New candidates MUST start as proposed; use transition() to advance the lifecycle.`, {
                details: {
                    candidateId: candidate.id,
                    status: candidate.status,
                },
            });
        }
        // If supersedesCandidateId is set, the superseded candidate must exist
        if (candidate.supersedesCandidateId !== undefined) {
            if (!this.records.has(candidate.supersedesCandidateId)) {
                throw new ContractValidationError(`Cannot add CandidateRecord: supersedesCandidateId ${candidate.supersedesCandidateId} does not exist in the store.`, {
                    details: {
                        candidateId: candidate.id,
                        supersedesCandidateId: candidate.supersedesCandidateId,
                    },
                });
            }
        }
        if (this.records.has(candidate.id)) {
            throw new ContractValidationError(`CandidateRecord already exists: ${candidate.id}`, { details: { candidateId: candidate.id } });
        }
        const stored = { ...candidate };
        this.records.set(stored.id, stored);
        this.insertionOrder.push(stored.id);
        return { ...stored };
    }
    get(id) {
        const record = this.records.get(id);
        if (!record)
            return undefined;
        return { ...record };
    }
    list() {
        return this.insertionOrder
            .map((id) => this.records.get(id))
            .filter((r) => r !== undefined)
            .map((r) => ({ ...r }));
    }
    transition(id, toStatus, reviewEntry) {
        const current = this.records.get(id);
        if (!current) {
            throw new ContractValidationError(`Cannot transition: CandidateRecord not found: ${id}`, { details: { candidateId: id } });
        }
        const fromStatus = current.status;
        if (!isCandidateTransitionAllowed(fromStatus, toStatus)) {
            throw new IllegalCandidateTransitionError(fromStatus, toStatus);
        }
        // Use transitionProvenance to append to the review trail AND
        // update the provenance kind. Note: the candidate's provenance
        // kind transitions are NOT the same as the candidate's status
        // transitions; the provenance tracks origin, the status tracks
        // the review workflow.
        //
        // For the review trail, we apply it to the provenance.reviewTrail
        // (which is the canonical place for review entries).
        const newReviewEntry = {
            ...reviewEntry,
            from: fromStatus, // status-as-kind for the trail
            to: toStatus,
        };
        const updated = {
            ...current,
            status: toStatus,
            provenance: {
                ...current.provenance,
                reviewTrail: [...(current.provenance.reviewTrail ?? []), newReviewEntry],
            },
        };
        validateCandidateRecord(updated);
        this.records.set(id, updated);
        return { ...updated };
    }
    appendReviewTrail(id, reviewEntry) {
        const current = this.records.get(id);
        if (!current) {
            throw new ContractValidationError(`Cannot appendReviewTrail: CandidateRecord not found: ${id}`, { details: { candidateId: id } });
        }
        const fromStatus = current.status;
        const newReviewEntry = {
            ...reviewEntry,
            from: fromStatus, // status-as-kind for the trail
            to: fromStatus,
        };
        const updated = {
            ...current,
            provenance: {
                ...current.provenance,
                reviewTrail: [...(current.provenance.reviewTrail ?? []), newReviewEntry],
            },
        };
        validateCandidateRecord(updated);
        this.records.set(id, updated);
        return { ...updated };
    }
    getVersionChain(assetId) {
        // Find all candidates targeting this assetId
        const candidates = this.list().filter((c) => c.assetId === assetId);
        if (candidates.length === 0)
            return [];
        // Build the chain: start from candidates that are NOT superseded
        // by any other candidate in the store. Then follow
        // supersedesCandidateId links backwards.
        const supersededIds = new Set();
        for (const c of candidates) {
            if (c.supersedesCandidateId !== undefined) {
                supersededIds.add(c.supersedesCandidateId);
            }
        }
        // The "head" of the chain is any candidate NOT in `supersededIds`.
        // There may be multiple heads if version chains have diverged;
        // we return the newest head and follow its chain backwards.
        const heads = candidates.filter((c) => !supersededIds.has(c.id));
        if (heads.length === 0) {
            // All candidates are superseded — shouldn't happen unless the
            // chain has a cycle. Return all candidates sorted by proposedAt.
            return [...candidates].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
        }
        // Pick the newest head (by proposedAt)
        const newestHead = [...heads].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))[0];
        // Follow the chain backwards from the newest head
        const chain = [newestHead];
        let current = newestHead;
        while (current.supersedesCandidateId !== undefined) {
            const prev = this.records.get(current.supersedesCandidateId);
            if (!prev)
                break; // chain broken — return what we have
            chain.push({ ...prev });
            current = prev;
        }
        return chain;
    }
    getActiveApproved(assetId) {
        // The active approved candidate is the one that:
        //   - has status `approved`
        //   - is NOT superseded by any other APPROVED candidate
        //
        // NOTE: a candidate with `supersedesCandidateId` set but status
        // `proposed` does NOT supersede the referenced candidate — the
        // supersede only takes effect when BOTH the superseder AND the
        // superseded are approved (the engine's `supersede` operation
        // is the canonical way to advance this).
        const candidates = this.list().filter((c) => c.assetId === assetId);
        const approved = candidates.filter((c) => c.status === "approved");
        if (approved.length === 0)
            return undefined;
        // Build the set of approved candidates that are superseded BY AN APPROVED CANDIDATE
        const supersededApprovedIds = new Set();
        for (const c of candidates) {
            // Only consider APPROVED candidates as valid superseders.
            // A proposed/under_review/rejected candidate that declares a
            // supersedesCandidateId does NOT mark the target as superseded.
            if (c.status === "approved" && c.supersedesCandidateId !== undefined) {
                const superseded = this.records.get(c.supersedesCandidateId);
                if (superseded && superseded.status === "approved") {
                    supersededApprovedIds.add(superseded.id);
                }
            }
        }
        // The active approved is the one NOT in the superseded set
        const active = approved.filter((c) => !supersededApprovedIds.has(c.id));
        if (active.length === 0)
            return undefined;
        // If multiple, return the newest
        active.sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
        return { ...active[0] };
    }
    size() {
        return this.records.size;
    }
}
//# sourceMappingURL=candidate-store.js.map