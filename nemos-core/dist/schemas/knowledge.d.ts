/**
 * Nemons Schema — Knowledge
 *
 * Knowledge consists of information used to understand a task,
 * repository, domain, or previous execution.
 *
 * Architectural principle enforced here:
 *   "Retrieved ≠ Approved" — retrieval establishes potential relevance,
 *   not authorization or correctness. The trust status of Knowledge
 *   is preserved across retrieval; it does not silently upgrade.
 *
 * Knowledge may be:
 *   - observed (lowest trust — derived from runtime observation)
 *   - imported (introduced from an external source)
 *   - proposed (suggested by candidate-generation)
 *   - reviewed (examined but not yet approved)
 *   - approved (governed and eligible for non-candidate use)
 *   - deprecated (explicitly retired)
 *
 * The lifecycle is enforced by `core/lifecycle.ts`.
 */
import type { Provenance } from "../core/provenance.js";
import type { KnowledgeId } from "../core/identifiers.js";
/**
 * The kind of subject a Knowledge record refers to.
 *
 * Used by the Context Resolver to filter relevant Knowledge for a Run.
 */
export type KnowledgeSubjectKind = "task" | "repository" | "domain" | "execution" | "policy" | "other";
/**
 * Applicability conditions for a Knowledge record.
 *
 * Used by the Context Resolver to decide whether the record is
 * eligible for selection.
 */
export interface KnowledgeApplicability {
    readonly subjectKind: KnowledgeSubjectKind;
    readonly subjectRef?: string;
    readonly taskKinds?: readonly string[];
    readonly taskTags?: readonly string[];
    readonly repoPatterns?: readonly string[];
}
/**
 * A Knowledge record.
 *
 * Invariants:
 *   - `provenance.kind` reflects the CURRENT trust status, NOT
 *     the original source. The trust status can only change via
 *     the governed lifecycle.
 *   - `content` is the knowledge payload. When content integrity
 *     matters, `provenance.contentHash` MUST be set and validated.
 */
export interface Knowledge {
    readonly id: KnowledgeId;
    readonly version: string;
    readonly provenance: Provenance;
    readonly title: string;
    readonly summary: string;
    readonly content: string;
    readonly applicability: KnowledgeApplicability;
    readonly tags?: readonly string[];
}
/**
 * Validates the structural contract of a Knowledge record.
 */
export declare function validateKnowledge(k: unknown): asserts k is Knowledge;
/**
 * Returns true iff the Knowledge record is approved operational
 * knowledge.
 */
export declare function isKnowledgeApproved(k: Knowledge): boolean;
/**
 * Returns true iff the Knowledge record is deprecated (explicitly retired).
 */
export declare function isKnowledgeDeprecated(k: Knowledge): boolean;
/**
 * Returns true iff the Knowledge record is observed-only — i.e., has
 * been observed but not promoted through any review.
 *
 * Such records MAY be retrieved for inspection but MUST NOT be treated
 * as authoritative operational knowledge.
 */
export declare function isKnowledgeObservedOnly(k: Knowledge): boolean;
//# sourceMappingURL=knowledge.d.ts.map