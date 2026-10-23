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
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";

/**
 * The kind of subject a Knowledge record refers to.
 *
 * Used by the Context Resolver to filter relevant Knowledge for a Run.
 */
export type KnowledgeSubjectKind =
  | "task"
  | "repository"
  | "domain"
  | "execution"
  | "policy"
  | "other";

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
export function validateKnowledge(k: unknown): asserts k is Knowledge {
  if (typeof k !== "object" || k === null) {
    throw new ContractValidationError("Knowledge must be a non-null object");
  }
  const r = k as Record<string, unknown>;
  if (!isValidIdString(r.id)) {
    throw new ContractValidationError("Knowledge.id must be a non-empty string");
  }
  if (!isValidIdString(r.version)) {
    throw new ContractValidationError("Knowledge.version must be a non-empty string");
  }
  if (typeof r.provenance !== "object" || r.provenance === null) {
    throw new ContractValidationError("Knowledge.provenance must be an object");
  }
  if (typeof r.title !== "string" || r.title.length === 0) {
    throw new ContractValidationError("Knowledge.title must be a non-empty string");
  }
  if (typeof r.summary !== "string") {
    throw new ContractValidationError("Knowledge.summary must be a string");
  }
  if (typeof r.content !== "string") {
    throw new ContractValidationError("Knowledge.content must be a string");
  }
  if (typeof r.applicability !== "object" || r.applicability === null) {
    throw new ContractValidationError("Knowledge.applicability must be an object");
  }
  if (r.tags !== undefined && !Array.isArray(r.tags)) {
    throw new ContractValidationError("Knowledge.tags must be an array if present");
  }
}

/**
 * Returns true iff the Knowledge record is approved operational
 * knowledge.
 */
export function isKnowledgeApproved(k: Knowledge): boolean {
  return k.provenance.kind === "approved";
}

/**
 * Returns true iff the Knowledge record is deprecated (explicitly retired).
 */
export function isKnowledgeDeprecated(k: Knowledge): boolean {
  return k.provenance.kind === "deprecated";
}

/**
 * Returns true iff the Knowledge record is observed-only — i.e., has
 * been observed but not promoted through any review.
 *
 * Such records MAY be retrieved for inspection but MUST NOT be treated
 * as authoritative operational knowledge.
 */
export function isKnowledgeObservedOnly(k: Knowledge): boolean {
  return k.provenance.kind === "observed";
}
