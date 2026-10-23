/**
 * Nemons Evaluation — Engine
 *
 * The EvaluationEngine applies defined criteria to Evidence and Run
 * outputs to produce an Evaluation decision.
 *
 * Architectural principles enforced here:
 *   - "Verification over appearance": an Evaluation that finds the
 *     Run's claimed success unsupported by sufficient Evidence MUST
 *     produce `claimed_succeeded_unverified`, NOT `verified_succeeded`.
 *   - "Evidence before claims": only verified Evidence counts toward
 *     satisfying criteria.
 */
import { validateEvaluation } from "../schemas/evaluation.js";
import { asEvaluationId, freshId } from "../core/identifiers.js";
/**
 * Positive keywords for contradiction detection (case-insensitive).
 * An Evidence claim containing a positive keyword (and no negative
 * keyword) indicates a success/favorable outcome.
 */
const POSITIVE_KEYWORDS = ["pass", "succeed", "ok", "true", "passed", "succeeded"];
/**
 * Negative keywords for contradiction detection (case-insensitive).
 * An Evidence claim containing a negative keyword (and no positive
 * keyword) indicates a failure/unfavorable outcome.
 */
const NEGATIVE_KEYWORDS = ["fail", "error", "false", "failed"];
function hasPositiveKeyword(claim) {
    const lower = claim.toLowerCase();
    return POSITIVE_KEYWORDS.some((k) => lower.includes(k));
}
function hasNegativeKeyword(claim) {
    const lower = claim.toLowerCase();
    return NEGATIVE_KEYWORDS.some((k) => lower.includes(k));
}
/**
 * Detects disagreement among verified Evidence records.
 *
 * Implements the VeriHarness insight (ADR-0007):
 *   "Disagreement often exposes correct alternatives, while consensus
 *    can conceal errors."
 *
 * Two Evidence records are contradictory if:
 *   - One's claim contains a positive keyword (and no negative keyword)
 *   - The other's claim contains a negative keyword (and no positive keyword)
 *
 * This is a conservative heuristic — it only flags clear contradictions.
 */
export function detectEvidenceDisagreement(evidence) {
    const byKind = new Map();
    for (const e of evidence) {
        if (!e.verified)
            continue;
        const group = byKind.get(e.kind) ?? [];
        group.push(e);
        byKind.set(e.kind, group);
    }
    for (const [kind, records] of byKind) {
        if (records.length < 2)
            continue;
        const positivePresent = records.some((e) => hasPositiveKeyword(e.claim) && !hasNegativeKeyword(e.claim));
        const negativePresent = records.some((e) => hasNegativeKeyword(e.claim) && !hasPositiveKeyword(e.claim));
        if (positivePresent && negativePresent) {
            return {
                hasDisagreement: true,
                description: `Evidence records of kind '${kind}' disagree: some claims indicate success, others indicate failure.`,
            };
        }
    }
    return { hasDisagreement: false, description: "" };
}
/**
 * Detects temporal inconsistency between Evidence records and the Run.
 *
 * Implements the LongHarness insight (ADR-0008):
 *   "Evidence-state drift: previously acquired evidence or subsequent
 *    corrections fail to inform the current conclusion."
 *
 * An Evidence record is "stale" (temporally inconsistent) if:
 *   - `run.startedAt` is set AND `evidence.recordedAt < run.startedAt`
 *     (recorded before the Run started — can't support claims about THIS Run)
 *   - `run.endedAt` is set AND `evidence.recordedAt > run.endedAt`
 *     (recorded after the Run ended — might be from a different context)
 *
 * Stale Evidence is EXCLUDED from the criterion satisfaction check.
 * The disagreement check (ADR-0007) runs ONLY on non-stale Evidence.
 *
 * @param evidence - the Evidence records to check (verified only recommended)
 * @param run - the Run to check against
 * @returns `{ hasInconsistency, description, staleEvidenceIds }`
 */
export function detectEvidenceTemporalInconsistency(evidence, run) {
    const staleIds = [];
    for (const e of evidence) {
        if (!e.verified)
            continue; // only check verified evidence
        // Check if recorded before the Run started
        if (run.startedAt && e.recordedAt < run.startedAt) {
            staleIds.push(e.id);
            continue;
        }
        // Check if recorded after the Run ended
        if (run.endedAt && e.recordedAt > run.endedAt) {
            staleIds.push(e.id);
        }
    }
    if (staleIds.length > 0) {
        return {
            hasInconsistency: true,
            description: `${staleIds.length} Evidence record(s) were recorded outside the Run's lifecycle ` +
                `(before start or after end). These records are excluded from the criterion check.`,
            staleEvidenceIds: staleIds,
        };
    }
    return {
        hasInconsistency: false,
        description: "",
        staleEvidenceIds: [],
    };
}
/**
 * Default EvaluationEngine implementation.
 *
 * Algorithm:
 *   1. For each criterion:
 *      a. Find Evidence records of the required kinds.
 *      b. Filter to VERIFIED Evidence only.
 *      c. Check for DISAGREEMENT among the verified Evidence (ADR-0007).
 *      d. The criterion is satisfied ONLY if:
 *         - At least one verified Evidence of the required kind exists
 *         - No disagreement is detected among the verified Evidence
 *   2. Aggregate:
 *      - If ALL required criteria are satisfied (including no disagreement)
 *        → `verified_succeeded`.
 *      - If the Run claimed success but criteria are not all satisfied
 *        → `claimed_succeeded_unverified`.
 *      - If the Run claimed failure → `failed`.
 *      - Else → `inconclusive`.
 */
export class DefaultEvaluationEngine {
    evaluate(input) {
        const { run, criteria, evidence, evaluator } = input;
        const results = criteria.map((c) => this.evaluateCriterion(c, evidence, run));
        const allRequiredSatisfied = results.every((r, i) => {
            const criterion = criteria[i];
            return criterion ? !criterion.required || r.satisfied : true;
        });
        let overallResult;
        const claimed = run.outputs?.claimedOutcome ?? "unknown";
        if (allRequiredSatisfied) {
            overallResult = "verified_succeeded";
        }
        else if (claimed === "succeeded") {
            overallResult = "claimed_succeeded_unverified";
        }
        else if (claimed === "failed") {
            overallResult = "failed";
        }
        else {
            overallResult = "inconclusive";
        }
        const now = new Date().toISOString();
        const id = asEvaluationId(freshId());
        const runId = run.id;
        const provenance = {
            kind: "observed",
            source: { kind: "run", runId, at: now },
        };
        const evaluation = {
            id,
            runId,
            criteria,
            results,
            overallResult,
            provenance,
            evaluatedAt: now,
            limitations: this.deriveLimitations(criteria, evidence, run),
            evaluator,
        };
        validateEvaluation(evaluation);
        return evaluation;
    }
    evaluateCriterion(c, evidence, run) {
        const examined = evidence.filter((e) => c.requiredEvidenceKinds.includes(e.kind));
        // Only VERIFIED evidence counts (architectural principle)
        const verifiedMatching = examined.filter((e) => e.verified);
        // ADR-0008: Check for temporal inconsistency (stale Evidence).
        // Stale Evidence is EXCLUDED before the disagreement check.
        const temporal = detectEvidenceTemporalInconsistency(verifiedMatching, run);
        const staleIds = new Set(temporal.staleEvidenceIds);
        const nonStaleEvidence = verifiedMatching.filter((e) => !staleIds.has(e.id));
        // ADR-0007: Check for disagreement among non-stale verified Evidence.
        const disagreement = detectEvidenceDisagreement(nonStaleEvidence);
        const satisfied = nonStaleEvidence.length > 0 && !disagreement.hasDisagreement;
        // Build the reason string
        let reason;
        if (verifiedMatching.length === 0) {
            reason = `No verified Evidence of kind(s) ${c.requiredEvidenceKinds.join(", ")} found.`;
        }
        else if (temporal.hasInconsistency && nonStaleEvidence.length === 0) {
            reason = `All verified Evidence of kind(s) ${c.requiredEvidenceKinds.join(", ")} is temporally stale (recorded outside the Run's lifecycle).`;
        }
        else if (disagreement.hasDisagreement) {
            reason = `Disagreement detected: ${disagreement.description}`;
        }
        else if (temporal.hasInconsistency) {
            reason = `Verified Evidence of kind(s) ${c.requiredEvidenceKinds.join(", ")} is present and consistent (${temporal.staleEvidenceIds.length} stale record(s) excluded).`;
        }
        else {
            reason = `Verified Evidence of kind(s) ${c.requiredEvidenceKinds.join(", ")} is present and consistent.`;
        }
        return {
            criterionId: c.id,
            satisfied,
            examinedEvidenceRefs: examined.map((e) => e.id),
            reason,
        };
    }
    deriveLimitations(criteria, evidence, run) {
        const lim = [];
        if (evidence.length === 0) {
            lim.push("No Evidence was provided for evaluation.");
        }
        if (criteria.length === 0) {
            lim.push("No criteria were defined; the evaluation is informational only.");
        }
        const unverified = evidence.filter((e) => !e.verified);
        if (unverified.length > 0) {
            lim.push(`${unverified.length} Evidence record(s) were not verified and did not count toward criteria.`);
        }
        // ADR-0007 + ADR-0008: Report disagreement as a limitation.
        // IMPORTANT: the disagreement check runs on NON-STALE Evidence only
        // (stale Evidence is excluded first, per ADR-0008's layered approach).
        const allVerified = evidence.filter((e) => e.verified);
        const temporal = detectEvidenceTemporalInconsistency(allVerified, run);
        const staleIds = new Set(temporal.staleEvidenceIds);
        const nonStaleVerified = allVerified.filter((e) => !staleIds.has(e.id));
        const disagreement = detectEvidenceDisagreement(nonStaleVerified);
        if (disagreement.hasDisagreement) {
            lim.push(`Disagreement detected: ${disagreement.description}`);
        }
        // ADR-0008: Report temporal inconsistency (stale Evidence) as a limitation
        if (temporal.hasInconsistency) {
            lim.push(`Temporal inconsistency: ${temporal.description} (stale IDs: ${temporal.staleEvidenceIds.join(", ")})`);
        }
        return lim;
    }
}
//# sourceMappingURL=evaluation-engine.js.map