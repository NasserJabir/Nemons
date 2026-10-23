/**
 * Nemons Schema — Memory
 *
 * Memory is Nemons' persistent operational knowledge store across Runs.
 *
 * Architectural principles enforced here:
 *   - Memory is NOT the current conversation transcript.
 *   - Memory is NOT synonymous with a Coding Agent's session history.
 *   - Memory MUST support retrieval, provenance, applicability,
 *     lifecycle management, and controlled reuse.
 *
 * Memory records are stored under a governed lifecycle; retrieval
 * preserves their trust status.
 */
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";
/**
 * Validates the structural contract of a Memory record.
 */
export function validateMemoryRecord(m) {
    if (typeof m !== "object" || m === null) {
        throw new ContractValidationError("MemoryRecord must be a non-null object");
    }
    const r = m;
    if (!isValidIdString(r.id)) {
        throw new ContractValidationError("MemoryRecord.id must be a non-empty string");
    }
    if (r.kind !== "experience" && r.kind !== "fact" && r.kind !== "decision" && r.kind !== "observation") {
        throw new ContractValidationError("MemoryRecord.kind must be a valid MemoryRecordKind", {
            details: { field: "kind", value: r.kind },
        });
    }
    if (typeof r.provenance !== "object" || r.provenance === null) {
        throw new ContractValidationError("MemoryRecord.provenance must be an object");
    }
    if (typeof r.applicability !== "object" || r.applicability === null) {
        throw new ContractValidationError("MemoryRecord.applicability must be an object");
    }
    if (typeof r.content !== "object" || r.content === null) {
        throw new ContractValidationError("MemoryRecord.content must be an object");
    }
    if (typeof r.createdAt !== "string" || r.createdAt.length === 0) {
        throw new ContractValidationError("MemoryRecord.createdAt must be a non-empty string");
    }
    if (typeof r.updatedAt !== "string" || r.updatedAt.length === 0) {
        throw new ContractValidationError("MemoryRecord.updatedAt must be a non-empty string");
    }
    if (r.kind === "experience" && (!isValidIdString(r.derivedFromRunId))) {
        throw new ContractValidationError("MemoryRecord of kind 'experience' requires derivedFromRunId", { details: { field: "derivedFromRunId" } });
    }
}
/**
 * Returns true iff the Memory record is approved for use as
 * authoritative operational knowledge.
 */
export function isMemoryApproved(m) {
    return m.provenance.kind === "approved";
}
/**
 * Returns true iff the Memory record is observed-only (lowest trust).
 *
 * Such records MAY be retrieved for inspection but MUST NOT be treated
 * as authoritative.
 */
export function isMemoryObservedOnly(m) {
    return m.provenance.kind === "observed";
}
/**
 * Returns true iff the Memory record is expired at the given reference
 * timestamp (ISO 8601). Records without `expiresAt` never expire.
 */
export function isMemoryExpired(m, nowIso) {
    if (m.applicability.expiresAt === undefined)
        return false;
    return m.applicability.expiresAt <= nowIso;
}
//# sourceMappingURL=memory.js.map