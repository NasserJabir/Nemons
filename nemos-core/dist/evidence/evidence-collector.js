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
import { validateEvidence, computeInlinePayloadHash } from "../schemas/evidence.js";
import { asEvidenceId, freshId, sha256Hex } from "../core/identifiers.js";
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
export class DefaultEvidenceCollector {
    fromAdapterEvent(runId, event) {
        const payload = JSON.stringify(event.payload, Object.keys(event.payload).sort());
        const artifact = {
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
    fromRunOutputs(runId, outputs) {
        const payload = JSON.stringify({
            claimedOutcome: outputs.claimedOutcome,
            claimedSummary: outputs.claimedSummary ?? "",
            artifactRefs: outputs.artifactRefs ?? [],
            traceRef: outputs.traceRef ?? "",
        });
        const artifact = {
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
    fromVerificationResult(runId, result) {
        const artifact = {
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
    fromAdapterInvocation(runId, result) {
        const list = [];
        list.push(this.fromRunOutputs(runId, result.outputs));
        for (const ev of result.adapterEvents ?? []) {
            list.push(this.fromAdapterEvent(runId, ev));
        }
        return list;
    }
    buildEvidence(input) {
        const now = new Date().toISOString();
        const source = {
            kind: "run",
            runId: input.runId,
            at: now,
        };
        const provenance = {
            kind: "observed",
            source,
            contentHash: input.artifact.contentHash,
        };
        const id = asEvidenceId(freshId());
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
//# sourceMappingURL=evidence-collector.js.map