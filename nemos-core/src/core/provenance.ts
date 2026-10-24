/**
 * Nemons Core — Provenance
 *
 * Provenance captures WHERE an asset or record came from, WHO or WHAT
 * produced it, and WHICH Run, source, or transformation it derives from.
 *
 * Provenance MUST exist before an asset is considered "reviewed" —
 * provenance-first is a non-negotiable architectural rule.
 *
 * Provenance is distinct from "approval": provenance establishes origin,
 * not authorization. A retrieved record retains its provenance even
 * when used; retrieval does not elevate trust status.
 */

import type {
  AssetId,
  EvidenceId,
  ExperienceId,
  RunId,
} from "./identifiers.js";

/**
 * The kind of origin that produced a record.
 *
 * - `observed`: derived from runtime execution observation (lowest trust).
 * - `imported`: introduced from an external source (e.g., docs, code).
 * - `proposed`: suggested by a candidate-generation mechanism.
 * - `reviewed`: has been examined by a review process (still not "approved").
 * - `approved`: has passed the governed approval process.
 * - `deprecated`: explicitly retired from active use.
 *
 * The transitions are unidirectional and explicit:
 *   observed  → candidate → reviewed → approved → deprecated
 *   imported  → candidate → reviewed → approved → deprecated
 *   proposed  → candidate → reviewed → approved → deprecated
 *
 * Skipping a stage is forbidden by the lifecycle module.
 */
export type ProvenanceKind =
  | "observed"
  | "imported"
  | "proposed"
  | "reviewed"
  | "approved"
  | "deprecated";

/**
 * The origin source for a record. Distinguishes:
 *   - human contribution
 *   - run-derived (an execution produced this)
 *   - evidence-derived (derived from a specific evidence record)
 *   - experience-derived (derived from an existing Experience)
 *   - external (imported from outside the runtime)
 */
export type ProvenanceSource =
  | { readonly kind: "human"; readonly actor: string; readonly at: string }
  | { readonly kind: "run"; readonly runId: RunId; readonly at: string }
  | { readonly kind: "evidence"; readonly evidenceId: EvidenceId; readonly at: string }
  | { readonly kind: "experience"; readonly experienceId: ExperienceId; readonly at: string }
  | { readonly kind: "external"; readonly system: string; readonly at: string };

/**
 * A complete provenance record attached to an operational asset.
 *
 * Invariants:
 *   - `kind` reflects the current trust status, NOT the original source.
 *   - `source` records the origin (immutable once set).
 *   - `derivedFrom` records the chain of derivations, if any.
 *   - `contentHash` pins the canonical content (SHA-256 hex) where content
 *     integrity matters. A record with no hash has unverified integrity.
 */
export interface Provenance {
  readonly kind: ProvenanceKind;
  readonly source: ProvenanceSource;
  readonly derivedFrom?: readonly AssetId[];
  readonly contentHash?: string;
  readonly reviewTrail?: readonly ReviewEntry[];
}

/**
 * One entry in a review trail — captures explicit lifecycle transitions.
 *
 * Allows tracing: who/what caused each transition, when, and with what
 * supporting evidence.
 */
export interface ReviewEntry {
  readonly from: ProvenanceKind;
  readonly to: ProvenanceKind;
  readonly at: string;
  readonly actor: string;
  readonly evidenceRef?: EvidenceId;
  readonly reason: string;
  /**
   * The structured review decision this entry records, when the entry
   * was produced by a governed review (`recordReview`). Persisting the
   * decision INSIDE the review trail is what makes approval state
   * survive a restart — the governed-evolution engine derives its
   * qualifying-approver count from these fields instead of from an
   * in-memory map. Entries produced by plain status transitions
   * (propose, rollback, supersede, …) leave it undefined.
   */
  readonly decision?: "approve" | "reject" | "request_changes";
  /** The reviewer's verbatim comment, when `decision` is present. */
  readonly comment?: string;
}

/**
 * Predicate: does the provenance satisfy the minimum required trust
 * status for a given operation? (i.e., is the kind at-or-above the
 * minimum required level?)
 *
 * Order (low → high trust):
 *   observed < imported < proposed < reviewed < approved
 *   (deprecated is "post-approval retired", treated specially)
 */
export function meetsMinimumTrust(p: Provenance, minimum: ProvenanceKind): boolean {
  if (p.kind === "deprecated") return false;
  const order: readonly ProvenanceKind[] = [
    "observed",
    "imported",
    "proposed",
    "reviewed",
    "approved",
  ];
  const a = order.indexOf(p.kind);
  const b = order.indexOf(minimum);
  // If either is -1, treat as not meeting — defensive.
  if (a < 0 || b < 0) return false;
  return a >= b;
}

/**
 * Returns true when the provenance kind has been explicitly retired
 * from active use. Retrieval of deprecated records is allowed for
 * audit/inspection but use is governed.
 */
export function isDeprecated(p: Provenance): boolean {
  return p.kind === "deprecated";
}

/**
 * Returns true when the provenance indicates the record is approved
 * operational knowledge (i.e., eligible for non-candidate use
 * subject to other policy constraints).
 */
export function isApproved(p: Provenance): boolean {
  return p.kind === "approved";
}

/**
 * Returns true when the provenance is "observed" only — i.e., derived
 * from runtime observation but not yet promoted through any review.
 *
 * Such records MUST NOT be used as authoritative operational knowledge.
 */
export function isObservedOnly(p: Provenance): boolean {
  return p.kind === "observed";
}
