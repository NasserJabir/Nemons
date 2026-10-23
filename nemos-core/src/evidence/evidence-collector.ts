/**
 * Nemons Evidence — Collector
 *
 * The EvidenceCollector produces Evidence records from adapter outputs
 * and adapter events. Each Evidence record is attributable to a Run.
 *
 * Architectural principles enforced here:
 *   - "Evidence before claims": the Collector is the canonical path
 *     for Evidence creation. There is no shortcut to claim success.
 *   - Content integrity: inline payloads receive a SHA-256 hash; the
 *     `verified` flag is `false` until the validator confirms.
 */

import type { Evidence, EvidenceArtifactRef } from "../schemas/evidence.js";
import { validateEvidence, computeInlinePayloadHash } from "../schemas/evidence.js";
import type { RunId, EvidenceId } from "../core/identifiers.js";
import { asEvidenceId, freshId, sha256Hex } from "../core/identifiers.js";
import type { Provenance, ProvenanceSource } from "../core/provenance.js";
import type { AdapterEvent, AdapterInvocationResult } from "../adapter/adapter-contract.js";
import type { RunOutputs } from "../schemas/run.js";

/**
 * The EvidenceCollector interface.
 */
export interface EvidenceCollector {
  /**
   * Produces an Evidence record from an adapter event. The event's
   * payload is serialized to a stable canonical form and hashed.
   */
  fromAdapterEvent(runId: RunId, event: AdapterEvent): Evidence;

  /**
   * Produces an Evidence record from the Run outputs (claimed outcome
   * + summary). This is a `text_assertion`-kind Evidence — it does
   * NOT, on its own, support a verified-succeeded claim.
   */
  fromRunOutputs(runId: RunId, outputs: RunOutputs): Evidence;

  /**
   * Produces an Evidence record from an explicit verification result.
   * Used by the Evaluation Engine (and any external verifier).
   */
  fromVerificationResult(runId: RunId, result: {
    readonly kind: "verification_report" | "acceptance_result" | "validation_output";
    readonly claim: string;
    readonly payload: string;
  }): Evidence;

  /**
   * Produces an Evidence record from an adapter invocation result,
   * generating multiple Evidence records (one per event + one for the
   * overall outputs). Returns the full list.
   */
  fromAdapterInvocation(runId: RunId, result: AdapterInvocationResult): Evidence[];
}

/**
 * Default EvidenceCollector implementation.
 *
 * The collector:
 *   - Records the provenance source as `run`-kind, with the RunId and
 *     timestamp. (The origin of every Evidence record is the Run that
 *     produced it.)
 *   - Computes a content hash for inline payloads using SHA-256.
 *   - Sets `verified = false` initially. Verification is performed by
 *     the EvidenceValidator (see evidence-validator.ts).
 */
export class DefaultEvidenceCollector implements EvidenceCollector {
  fromAdapterEvent(runId: RunId, event: AdapterEvent): Evidence {
    const payload = JSON.stringify(event.payload, Object.keys(event.payload).sort());
    const artifact: EvidenceArtifactRef = {
      inlinePayload: payload,
      contentHash: sha256Hex(payload),
      contentType: "application/json",
      bytes: payload.length,
    };
    const evidence = this.buildEvidence({
      runId,
      kind: "adapter_event",
      claim: `Adapter event: ${event.kind}`,
      artifact,
    });
    validateEvidence(evidence);
    return evidence;
  }

  fromRunOutputs(runId: RunId, outputs: RunOutputs): Evidence {
    const payload = JSON.stringify({
      claimedOutcome: outputs.claimedOutcome,
      claimedSummary: outputs.claimedSummary ?? "",
      artifactRefs: outputs.artifactRefs ?? [],
      traceRef: outputs.traceRef ?? "",
    });
    const artifact: EvidenceArtifactRef = {
      inlinePayload: payload,
      contentHash: computeInlinePayloadHash(payload),
      contentType: "application/json",
      bytes: payload.length,
    };
    const evidence = this.buildEvidence({
      runId,
      kind: "text_assertion",
      claim: `Run outputs claim: ${outputs.claimedOutcome}`,
      artifact,
    });
    validateEvidence(evidence);
    return evidence;
  }

  fromVerificationResult(runId: RunId, result: {
    readonly kind: "verification_report" | "acceptance_result" | "validation_output";
    readonly claim: string;
    readonly payload: string;
  }): Evidence {
    const artifact: EvidenceArtifactRef = {
      inlinePayload: result.payload,
      contentHash: sha256Hex(result.payload),
      contentType: "application/json",
      bytes: result.payload.length,
    };
    const evidence = this.buildEvidence({
      runId,
      kind: result.kind,
      claim: result.claim,
      artifact,
    });
    validateEvidence(evidence);
    return evidence;
  }

  fromAdapterInvocation(runId: RunId, result: AdapterInvocationResult): Evidence[] {
    const list: Evidence[] = [];
    list.push(this.fromRunOutputs(runId, result.outputs));
    for (const ev of result.adapterEvents ?? []) {
      list.push(this.fromAdapterEvent(runId, ev));
    }
    return list;
  }

  private buildEvidence(input: {
    readonly runId: RunId;
    readonly kind: Evidence["kind"];
    readonly claim: string;
    readonly artifact: EvidenceArtifactRef;
  }): Evidence {
    const now = new Date().toISOString();
    const source: ProvenanceSource = {
      kind: "run",
      runId: input.runId,
      at: now,
    };
    const provenance: Provenance = {
      kind: "observed",
      source,
      contentHash: input.artifact.contentHash,
    };
    const id: EvidenceId = asEvidenceId(freshId());
    return {
      id,
      runId: input.runId,
      kind: input.kind,
      claim: input.claim,
      artifact: input.artifact,
      provenance,
      recordedAt: now,
      verified: false,
    };
  }
}
