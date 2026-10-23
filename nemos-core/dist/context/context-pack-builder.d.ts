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
import type { ContextResolutionResult } from "./context-resolver.js";
import type { ContextPack, ContextPackResourceConstraints } from "../schemas/context-pack.js";
import { candidateAssetsInContextPack } from "../schemas/context-pack.js";
import type { PolicyEngine } from "../policy/policy-engine.js";
import type { RunId } from "../core/identifiers.js";
/**
 * The ContextPackBuilder interface.
 */
export interface ContextPackBuilder {
    build(input: {
        readonly runId: RunId;
        readonly resolution: ContextResolutionResult;
        readonly experimentalRun?: boolean;
        readonly policyConstraints?: readonly string[];
        /**
         * The capabilities available in the current adapter. The builder
         * passes these to the policy engine so the CapabilityRequirementRule
         * can verify Skill selection. If omitted, the policy engine's
         * capability rule will defer (the resolver already enforces
         * capabilities as a primary check).
         */
        readonly availableCapabilities?: ReadonlySet<string>;
    }): ContextPack;
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
export declare class DefaultContextPackBuilder implements ContextPackBuilder {
    private readonly policy;
    private readonly constraints;
    constructor(policy: PolicyEngine, constraints: ContextPackResourceConstraints);
    build(input: {
        readonly runId: RunId;
        readonly resolution: ContextResolutionResult;
        readonly experimentalRun?: boolean;
        readonly policyConstraints?: readonly string[];
        readonly availableCapabilities?: ReadonlySet<string>;
    }): ContextPack;
    private processCandidate;
    private estimateBytes;
}
/**
 * Returns the candidate (non-approved) assets in a Context Pack.
 * Re-exported here for convenience — defined in the schema module.
 */
export { candidateAssetsInContextPack };
//# sourceMappingURL=context-pack-builder.d.ts.map