/**
 * Nemons Context — Pack Builder
 *
 * The ContextPackBuilder constructs a validated, resource-bounded
 * Context Pack from a ContextResolutionResult.
 *
 * Architectural principles enforced here:
 *   - The Builder ENFORCES policy for each candidate asset. Candidate
 *     (non-approved) assets are NOT silently included — they require
 *     explicit `experimentalRun=true` AND the PolicyEngine to allow
 *     the inclusion.
 *   - The Builder enforces resource constraints (maxAssets, maxBytes).
 *   - The Builder records exclusions, so the Context Pack is fully
 *     inspectable.
 *   - "No silent mutation": the Context Pack is immutable once built.
 */
import { validateContextPack, contextPackRespectsConstraints, candidateAssetsInContextPack } from "../schemas/context-pack.js";
import { ContractValidationError } from "../core/errors.js";
import { asContextPackId, freshId } from "../core/identifiers.js";
function normalizePersona(p) {
    return { id: p.id, version: p.version, provenanceKind: p.provenance.kind };
}
function normalizeSkill(s) {
    return { id: s.id, version: s.version, provenanceKind: s.provenance.kind };
}
function normalizeKnowledge(k) {
    return { id: k.id, version: k.version, provenanceKind: k.provenance.kind };
}
function normalizeMemory(m) {
    return { id: m.id, version: "v1", provenanceKind: m.provenance.kind };
}
/**
 * Default ContextPackBuilder implementation.
 *
 * Construction steps:
 *   1. For each included candidate in the resolution:
 *      a. Decide the policy operation kind:
 *         - if candidate (non-approved): `context_pack.include_candidate`
 *         - if approved: `context_pack.select_asset`
 *      b. Evaluate the policy via the PolicyEngine.
 *      c. If denied → record as exclusion with reason `policy`.
 *      d. If allowed → include in the pack with the policy decision reference.
 *   2. Enforce resource constraints (maxAssets, maxBytes).
 *   3. Construct and validate the Context Pack.
 *
 * The Builder raises `ContractValidationError` if the built pack
 * violates its own constraints — this is a hard-fail signal that
 * the Builder's logic is broken.
 */
export class DefaultContextPackBuilder {
    policy;
    constraints;
    constructor(policy, constraints) {
        this.policy = policy;
        this.constraints = constraints;
    }
    build(input) {
        const assets = [];
        const exclusions = [];
        const experimentalRun = input.experimentalRun ?? false;
        const availableCapabilities = input.availableCapabilities;
        // Process each asset kind using normalized helpers
        for (const c of input.resolution.personas) {
            this.processCandidate(c, "persona", normalizePersona(c.asset), experimentalRun, availableCapabilities, assets, exclusions);
        }
        for (const c of input.resolution.skills) {
            this.processCandidate(c, "skill", normalizeSkill(c.asset), experimentalRun, availableCapabilities, assets, exclusions, c.asset.requiredCapabilities);
        }
        for (const c of input.resolution.knowledge) {
            this.processCandidate(c, "knowledge", normalizeKnowledge(c.asset), experimentalRun, availableCapabilities, assets, exclusions);
        }
        for (const c of input.resolution.memory) {
            this.processCandidate(c, "memory", normalizeMemory(c.asset), experimentalRun, availableCapabilities, assets, exclusions);
        }
        // Enforce maxAssets constraint: drop excess candidates
        let boundedAssets = assets;
        if (boundedAssets.length > this.constraints.maxAssets) {
            boundedAssets = boundedAssets.slice(0, this.constraints.maxAssets);
        }
        // Enforce maxBytes constraint: drop largest assets until fits
        let totalBytes = this.estimateBytes(boundedAssets);
        while (totalBytes > this.constraints.maxContentBytes && boundedAssets.length > 0) {
            boundedAssets = boundedAssets.slice(0, -1);
            totalBytes = this.estimateBytes(boundedAssets);
        }
        const pack = {
            id: asContextPackId(freshId()),
            runId: input.runId,
            assets: boundedAssets,
            exclusions,
            constraints: this.constraints,
            actualBytes: totalBytes,
            policyConstraints: input.policyConstraints,
            createdAt: new Date().toISOString(),
        };
        validateContextPack(pack);
        if (!contextPackRespectsConstraints(pack)) {
            throw new ContractValidationError("Built Context Pack violates its own resource constraints", {
                details: {
                    maxAssets: pack.constraints.maxAssets,
                    actualAssets: pack.assets.length,
                    maxBytes: pack.constraints.maxContentBytes,
                    actualBytes: pack.actualBytes,
                },
            });
        }
        return pack;
    }
    processCandidate(c, assetKind, normalized, experimentalRun, availableCapabilities, assets, exclusions, requiredCapabilities) {
        if (!c.included) {
            exclusions.push({
                assetKind,
                assetId: normalized.id,
                reason: c.reason,
                reasonKind: c.exclusionReasonKind ?? "applicability",
            });
            return;
        }
        const kind = normalized.provenanceKind;
        const isCandidate = kind !== "approved" && kind !== "deprecated";
        const operation = isCandidate ? "context_pack.include_candidate" : "context_pack.select_asset";
        const decision = this.policy.decide({
            operation,
            requestedBy: "context-pack-builder",
            inputs: {
                experimentalRun,
                requiredCapabilities,
                assetKind,
                assetId: normalized.id,
                assetVersion: normalized.version,
            },
            assetProvenanceKind: kind,
            availableCapabilities,
        });
        if (decision.outcome !== "allow") {
            exclusions.push({
                assetKind,
                assetId: normalized.id,
                reason: `Policy denied: ${decision.reason}`,
                reasonKind: "policy",
            });
            return;
        }
        assets.push({
            assetKind,
            assetId: normalized.id,
            version: normalized.version,
            provenanceKind: kind,
            selectionReason: `Policy allowed (${decision.id})`,
            policyDecisionRef: decision.id,
        });
    }
    estimateBytes(assets) {
        // Rough estimate: each asset reference is ~256 bytes (id + version +
        // provenance + reason). Real implementations would compute from
        // the actual content payload, but for the Core we use a stable
        // upper-bound estimate that's deterministic.
        return assets.length * 256;
    }
}
/**
 * Returns the candidate (non-approved) assets in a Context Pack.
 * Re-exported here for convenience — defined in the schema module.
 */
export { candidateAssetsInContextPack };
//# sourceMappingURL=context-pack-builder.js.map