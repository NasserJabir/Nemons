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
import type { PolicyRule } from "./policy-contracts.js";
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
export declare const DefaultDenyRule: PolicyRule;
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
export declare const LifecycleGateRule: PolicyRule;
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
export declare const NoCandidatePromotionRule: PolicyRule;
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
export declare const NoImplicitTrustEscalationRule: PolicyRule;
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
export declare const CapabilityRequirementRule: PolicyRule;
/**
 * The list of all built-in rules. Used by the runtime to register
 * the baseline policy on startup.
 */
export declare const BUILTIN_POLICY_RULES: readonly PolicyRule[];
//# sourceMappingURL=builtin-rules.d.ts.map