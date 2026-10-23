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

import type { Provenance } from "../core/provenance.js";
import type { MemoryRecordId, RunId, ExperienceId } from "../core/identifiers.js";
import { ContractValidationError } from "../core/errors.js";
import { isValidIdString } from "../core/identifiers.js";

/**
 * The kind of memory record — distinguishes different operational
 * memory categories.
 */
export type MemoryRecordKind =
  | "experience" // derived from a Run's evaluated outcome
  | "fact" // a recorded fact (e.g., a stable repo invariant)
  | "decision" // an explicit decision record
  | "observation"; // raw observation, lowest trust

/**
 * Applicability conditions for a Memory record. Used by retrieval to
 * decide which records are relevant for a given Run.
 */
export interface MemoryApplicability {
  readonly taskKinds?: readonly string[];
  readonly taskTags?: readonly string[];
  readonly repoPatterns?: readonly string[];
  readonly expiresAt?: string; // ISO timestamp; record is not retrieved after
}

/**
 * The semantic category of a Memory record (ADR-0014, from
 * "Category-Conditioned Memory Retention" — https://arxiv.org/abs/2610.07100).
 *
 * The paper found that values/beliefs have only 77.9% source support
 * (vs. 96.2% for other categories). A global retention threshold
 * cannot separate these. Category-conditioned thresholds reduce
 * unsupported retentions by ~36% while preserving 13pp more coverage.
 *
 * This is DISTINCT from `MemoryRecordKind` (which is an operational
 * classification: experience/fact/decision/observation). The
 * `MemoryCategory` is a semantic classification used for RETENTION
 * POLICY: strict categories require stronger provenance before
 * retention; lenient categories can be retained as observed.
 *
 * - `fact`: verifiable factual information (e.g., "the test runner uses vitest")
 * - `procedure`: how-to knowledge (e.g., "rebuild before running tests")
 * - `decision`: an explicit decision record (e.g., "we chose vitest over jest")
 * - `value`: values, beliefs, preferences (e.g., "vitest is better than jest") — STRICT
 * - `prediction`: predictions or hypotheses (e.g., "this approach will scale") — STRICT
 * - `uncategorized`: no category specified (backward-compatible default)
 */
export type MemoryCategory =
  | "fact"
  | "procedure"
  | "decision"
  | "value"
  | "prediction"
  | "uncategorized";

/**
 * A Memory record.
 *
 * Field invariants:
 *   - `id`: stable MemoryRecordId.
 *   - `kind`: what category of memory this is (operational).
 *   - `provenance`: lifecycle + origin. Trust status is preserved
 *     across retrieval.
 *   - `applicability`: when this record is relevant.
 *   - `derivedFromRunId`: optional reference to the Run that produced
 *      this Memory (for "experience"-kind records, this is required).
 *   - `derivedFromExperienceId`: optional reference to the source
 *      Experience record, when applicable.
 *   - `content`: the actual memory payload (JSON-serializable).
 *   - `category?`: semantic category for retention policy (ADR-0014).
 *      Optional — when absent, the record is treated as "uncategorized"
 *      and uses the existing lifecycle-based retention.
 */
export interface MemoryRecord {
  readonly id: MemoryRecordId;
  readonly kind: MemoryRecordKind;
  readonly provenance: Provenance;
  readonly applicability: MemoryApplicability;
  readonly derivedFromRunId?: RunId;
  readonly derivedFromExperienceId?: ExperienceId;
  readonly content: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * Semantic category for retention policy (ADR-0014).
   * Optional — backward-compatible when absent.
   */
  readonly category?: MemoryCategory;
}

/**
 * Validates the structural contract of a Memory record.
 */
export function validateMemoryRecord(m: unknown): asserts m is MemoryRecord {
  if (typeof m !== "object" || m === null) {
    throw new ContractValidationError("MemoryRecord must be a non-null object");
  }
  const r = m as Record<string, unknown>;
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
    throw new ContractValidationError(
      "MemoryRecord of kind 'experience' requires derivedFromRunId",
      { details: { field: "derivedFromRunId" } },
    );
  }
}

/**
 * Returns true iff the Memory record is approved for use as
 * authoritative operational knowledge.
 */
export function isMemoryApproved(m: MemoryRecord): boolean {
  return m.provenance.kind === "approved";
}

/**
 * Returns true iff the Memory record is observed-only (lowest trust).
 *
 * Such records MAY be retrieved for inspection but MUST NOT be treated
 * as authoritative.
 */
export function isMemoryObservedOnly(m: MemoryRecord): boolean {
  return m.provenance.kind === "observed";
}

/**
 * Returns true iff the Memory record is expired at the given reference
 * timestamp (ISO 8601). Records without `expiresAt` never expire.
 */
export function isMemoryExpired(m: MemoryRecord, nowIso: string): boolean {
  if (m.applicability.expiresAt === undefined) return false;
  return m.applicability.expiresAt <= nowIso;
}
