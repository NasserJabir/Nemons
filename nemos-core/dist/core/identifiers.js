/**
 * Nemons Core — Identifiers
 *
 * Stable identity types that distinguish durable asset identity from
 * per-instance, per-checkout, or per-execution identity.
 *
 * Architectural principle enforced here:
 *   "Identity is not instance" — a stable asset or repository identity
 *   must be distinguished from a particular checkout, execution, or
 *   runtime instance.
 */
/**
 * Branded-type constructors. Using `as` cast at the boundary to keep
 * the brand meaningful at the type level while remaining runtime-cheap.
 */
export const asRunId = (s) => s;
export const asEvidenceId = (s) => s;
export const asContextPackId = (s) => s;
export const asEvaluationId = (s) => s;
export const asExperienceId = (s) => s;
export const asMemoryRecordId = (s) => s;
export const asPolicyDecisionId = (s) => s;
export const asPersonaId = (s) => s;
export const asSkillId = (s) => s;
export const asKnowledgeId = (s) => s;
export const asCandidateId = (s) => s;
/**
 * Generates a fresh opaque identifier (collision-resistant).
 *
 * Uses `crypto.randomUUID()` from the Node.js standard library — no
 * external dependencies introduced. Identifiers are stable in the
 * sense of being unique per call; they are not content-addressed.
 */
export function freshId() {
    // `crypto` is a node:builtin module, available in Node 19+.
    // Using globalThis crypto for runtime portability.
    const g = globalThis;
    if (g.crypto && typeof g.crypto.randomUUID === "function") {
        return g.crypto.randomUUID();
    }
    // Fallback: time + random. Should not be reached on Node 20+.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
/**
 * Predicate: is the value a non-empty string suitable as an id?
 */
export function isValidIdString(s) {
    return typeof s === "string" && s.length > 0 && s.length <= 1024 && !s.includes("\u0000");
}
/**
 * Cryptographic hash helper — produces a hex SHA-256 of canonical bytes.
 *
 * Used by Evidence and Provenance to pin content integrity without
 * importing any external crypto package. The Node.js `crypto` builtin
 * is used via top-level import so the function works in BOTH CommonJS
 * and ESM contexts (the previous `require()` failed when the package
 * was loaded as ESM by the daemon bridge).
 */
import { createHash } from "node:crypto";
export function sha256Hex(canonicalBytes) {
    const h = createHash("sha256");
    const u = h.update(canonicalBytes);
    return u.digest("hex");
}
/**
 * Helper used to satisfy TS strict checks when a value is provably
 * defined. Avoids spreading `!` non-null assertions across the codebase.
 */
export function assertDefined(v, msg) {
    if (v === undefined || v === null) {
        throw new Error(msg);
    }
    return v;
}
//# sourceMappingURL=identifiers.js.map