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
import type { Evidence } from "../schemas/evidence.js";
import type { RunId } from "../core/identifiers.js";
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
export declare class DefaultEvidenceCollector implements EvidenceCollector {
    fromAdapterEvent(runId: RunId, event: AdapterEvent): Evidence;
    fromRunOutputs(runId: RunId, outputs: RunOutputs): Evidence;
    fromVerificationResult(runId: RunId, result: {
        readonly kind: "verification_report" | "acceptance_result" | "validation_output";
        readonly claim: string;
        readonly payload: string;
    }): Evidence;
    fromAdapterInvocation(runId: RunId, result: AdapterInvocationResult): Evidence[];
    private buildEvidence;
}
//# sourceMappingURL=evidence-collector.d.ts.map