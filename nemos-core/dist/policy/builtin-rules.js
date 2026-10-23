/**
 * Nemons Policy — Built-in Rules
 *
 * The rules that encode the architectural principles into enforceable
 * policy:
 *
 *   1. DefaultDenyRule       — operations with no explicit allow are denied.
 *   2. LifecycleGateRule     — assets must be `approved` (or governed
 *                               candidate use) for selected operations.
 *   3. NoCandidatePromotionRule — using a candidate asset does not
 *                               silently promote it.
 *   4. NoImplicitTrustEscalationRule — explicit checks against implicit
 *                               trust transitions.
 *   5. CapabilityRequirementRule — operations targeting Skills require
 *                               adapter capabilities.
 *
 * These rules are the minimal mandatory set. The PolicyEngine can be
 * extended with additional rules via the registry, but these rules
 * form the runtime's hard-deny baseline.
 */
/**
 * Rule: Default-Deny.
 *
 * Applies to ALL operations. Always returns `defer`. This rule exists
 * so that operations with NO other applicable rule receive an aggregate
 * of `defer` rather than being silently allowed.
 *
 * Combined with the aggregate function (deny > defer > allow), this
 * means: an operation is allowed ONLY when another rule explicitly
 * allows it. Default-deny is encoded as "no explicit allow → deny"
 * at the aggregate level; this rule makes the default visible in the
 * audit trail.
 */
export const DefaultDenyRule = {
    ruleId: "nemons.builtin.default-deny",
    description: "Default-deny: an operation is allowed only when another rule explicitly allows it.",
    appliesTo: [
        "run.start",
        "run.record_evidence",
        "run.transition_state",
        "context_pack.select_asset",
        "context_pack.include_candidate",
        "memory.retrieve",
        "experience.reuse",
        "knowledge.promote",
        "skill.promote",
        "persona.promote",
        "adapter.invoke",
        "governed_evolution.propose_change",
    ],
    evaluate: (_ctx) => ({
        ruleId: "nemons.builtin.default-deny",
        ruleDescription: "Default-deny baseline.",
        outcome: "defer",
        reason: "Default-deny baseline; requires an explicit allow from another rule.",
    }),
};
/**
 * Rule: Lifecycle gate.
 *
 * Applies to operations that target operational assets and require the
 * asset to be `approved` (or `deprecated` for audit operations).
 *
 * - For `context_pack.select_asset` and `experience.reuse`:
 *   - if the asset is `proposed`/`observed`/`imported`/`reviewed`:
 *     defer (requires governed candidate-use authorization).
 *   - if the asset is `approved`: allow.
 *   - if the asset is `deprecated`: deny (cannot be used except under audit).
 *
 * This rule encodes:
 *   - "Use is not adoption" (candidate use requires explicit authorization)
 *   - "Retrieved is not approved" (reviewed is not approved)
 */
export const LifecycleGateRule = {
    ruleId: "nemons.builtin.lifecycle-gate",
    description: "Asset-targeted operations require the asset to be `approved` (or governed candidate-use).",
    appliesTo: [
        "context_pack.select_asset",
        "context_pack.include_candidate",
        "experience.reuse",
        "memory.retrieve",
    ],
    evaluate: (ctx) => {
        const kind = ctx.assetProvenanceKind;
        if (kind === undefined) {
            return {
                ruleId: "nemons.builtin.lifecycle-gate",
                ruleDescription: "Lifecycle gate requires assetProvenanceKind to be set.",
                outcome: "deny",
                reason: "Lifecycle gate could not determine asset provenance kind.",
            };
        }
        if (kind === "approved") {
            return {
                ruleId: "nemons.builtin.lifecycle-gate",
                ruleDescription: "Approved asset — eligible for use.",
                outcome: "allow",
                reason: "Asset provenance is `approved`.",
            };
        }
        if (kind === "deprecated") {
            return {
                ruleId: "nemons.builtin.lifecycle-gate",
                ruleDescription: "Deprecated asset — denied for active use.",
                outcome: "deny",
                reason: "Asset is deprecated; cannot be used except under explicit audit authorization.",
            };
        }
        // observed, imported, proposed, reviewed → defer (requires governed authorization)
        return {
            ruleId: "nemons.builtin.lifecycle-gate",
            ruleDescription: "Non-approved asset — requires governed candidate-use authorization.",
            outcome: "defer",
            reason: `Asset provenance is \`${kind}\`; non-approved use requires explicit authorization.`,
        };
    },
};
/**
 * Rule: No candidate promotion.
 *
 * Applies to `context_pack.include_candidate`. This rule ALLOWS
 * including a candidate asset IN A CONTROLLED EXPERIMENTAL RUN ONLY
 * when the operation context explicitly marks the run as experimental.
 *
 * Without the experimental marker, the rule defers (effectively denying
 * because no other rule will allow it).
 *
 * This rule encodes:
 *   - "Use is not adoption" — using a candidate does not silently
 *     promote it. Inclusion is recorded as candidate use, not as approval.
 */
export const NoCandidatePromotionRule = {
    ruleId: "nemons.builtin.no-candidate-promotion",
    description: "Candidate asset inclusion is allowed only in explicitly experimental Runs.",
    appliesTo: ["context_pack.include_candidate"],
    evaluate: (ctx) => {
        const experimental = ctx.inputs.experimentalRun === true;
        if (experimental) {
            return {
                ruleId: "nemons.builtin.no-candidate-promotion",
                ruleDescription: "Candidate inclusion in experimental Run.",
                outcome: "allow",
                reason: "Run is explicitly marked experimental; candidate inclusion permitted.",
            };
        }
        return {
            ruleId: "nemons.builtin.no-candidate-promotion",
            ruleDescription: "Candidate inclusion requires experimental Run marker.",
            outcome: "deny",
            reason: "Candidate asset inclusion requires explicit experimental-Run marker.",
        };
    },
};
/**
 * Rule: No implicit trust escalation.
 *
 * Applies to promotion operations (`knowledge.promote`, `skill.promote`,
 * `persona.promote`). These operations are NEVER implicitly allowed:
 * they require explicit `governedReview = true` in the inputs.
 *
 * This rule encodes:
 *   - "No silent mutation": lifecycle status changes require governed review.
 */
export const NoImplicitTrustEscalationRule = {
    ruleId: "nemons.builtin.no-implicit-trust-escalation",
    description: "Promotion operations require explicit governed-review authorization.",
    appliesTo: ["knowledge.promote", "skill.promote", "persona.promote"],
    evaluate: (ctx) => {
        if (ctx.inputs.governedReview === true) {
            return {
                ruleId: "nemons.builtin.no-implicit-trust-escalation",
                ruleDescription: "Promotion authorized by governed review.",
                outcome: "allow",
                reason: "Promotion has explicit governed-review authorization.",
            };
        }
        return {
            ruleId: "nemons.builtin.no-implicit-trust-escalation",
            ruleDescription: "Promotion requires governed review.",
            outcome: "deny",
            reason: "Promotion requires explicit governed-review authorization; implicit promotion is forbidden.",
        };
    },
};
/**
 * Rule: Capability requirement.
 *
 * Applies to `context_pack.select_asset` and `context_pack.include_candidate`
 * for Skill-kind assets. The rule checks that the adapter exposes every
 * required capability declared by the Skill. If not, the rule denies.
 *
 * This rule encodes:
 *   - "Explicit boundaries": integrations must pass through documented
 *     interfaces and adapters; a Skill whose capability requirements
 *     cannot be met MUST NOT be selected.
 */
export const CapabilityRequirementRule = {
    ruleId: "nemons.builtin.capability-requirement",
    description: "Skill selection requires the adapter to expose every required capability.",
    appliesTo: ["context_pack.select_asset", "context_pack.include_candidate"],
    evaluate: (ctx) => {
        const required = ctx.inputs.requiredCapabilities;
        if (!required || required.length === 0) {
            // Neutral: no capability requirements to check (e.g., for non-Skill
            // assets like Persona/Knowledge/Memory). Returning `defer` here is
            // critical — returning `allow` would silently override the lifecycle
            // gate's `defer` for non-approved assets, violating default-deny.
            return {
                ruleId: "nemons.builtin.capability-requirement",
                ruleDescription: "No capability requirements; neutral.",
                outcome: "defer",
                reason: "Asset declares no required capabilities; capability rule is neutral.",
            };
        }
        const available = ctx.availableCapabilities;
        if (!available) {
            return {
                ruleId: "nemons.builtin.capability-requirement",
                ruleDescription: "Adapter capabilities unknown.",
                outcome: "deny",
                reason: "Cannot verify capability requirements: adapter capability set is unknown.",
            };
        }
        const missing = required.filter((r) => r.required &&
            !available.has(r.capability) &&
            (r.fallbackCapability === undefined || !available.has(r.fallbackCapability)));
        if (missing.length > 0) {
            return {
                ruleId: "nemons.builtin.capability-requirement",
                ruleDescription: "Adapter missing required capabilities.",
                outcome: "deny",
                reason: `Adapter is missing required capabilities: ${missing.map((m) => m.capability).join(", ")}`,
                matchedInputs: { missing: missing.map((m) => m.capability) },
            };
        }
        return {
            ruleId: "nemons.builtin.capability-requirement",
            ruleDescription: "All required capabilities available.",
            outcome: "allow",
            reason: "Adapter exposes all required capabilities.",
        };
    },
};
/**
 * The list of all built-in rules. Used by the runtime to register
 * the baseline policy on startup.
 */
export const BUILTIN_POLICY_RULES = [
    DefaultDenyRule,
    LifecycleGateRule,
    NoCandidatePromotionRule,
    NoImplicitTrustEscalationRule,
    CapabilityRequirementRule,
];
//# sourceMappingURL=builtin-rules.js.map