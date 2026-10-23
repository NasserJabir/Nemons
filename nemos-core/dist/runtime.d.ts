/**
 * Nemons — Runtime bootstrap.
 *
 * The `buildRuntime` function constructs the default Nemons runtime
 * with all built-in components wired together. This is the convenient
 * entry point for tests and fixtures; production deployments may
 * substitute components (e.g., a different adapter or persistent
 * storage).
 *
 * Architectural principles enforced here:
 *   - The runtime is COMPOSED, not a monolithic class. Each component
 *     is independent and replaceable.
 *   - The default policy rules are registered here; production
 *     deployments may extend (but not remove) the baseline rules.
 *   - The default adapter is `MockAdapter` (NON-PRODUCTION); production
 *     deployments MUST register a real adapter.
 *
 * Stage D additions:
 *   - experienceStore: in-memory store for Experience records
 *   - experienceDeriver: produces Experience from Evidence + Evaluation
 *   - experienceRetriever: finds applicable Experience for a new Run
 */
import type { PolicyEngine } from "./policy/policy-engine.js";
import type { AdapterRegistry } from "./adapter/adapter-registry.js";
import type { RunManager } from "./run/run-manager.js";
import type { EvidenceCollector, EvidenceValidator } from "./evidence/index.js";
import type { EvaluationEngine } from "./evaluation/evaluation-engine.js";
import type { ExperienceStore, ExperienceDeriver, ExperienceRetriever } from "./experience/index.js";
/**
 * A composed Nemons runtime. Each field is an independent component
 * — there is no monolithic "Runtime" class, by design.
 */
export interface NemonsRuntime {
    readonly policyEngine: PolicyEngine;
    readonly adapterRegistry: AdapterRegistry;
    readonly runManager: RunManager;
    readonly evidenceCollector: EvidenceCollector;
    readonly evidenceValidator: EvidenceValidator;
    readonly evaluationEngine: EvaluationEngine;
    readonly experienceStore: ExperienceStore;
    readonly experienceDeriver: ExperienceDeriver;
    readonly experienceRetriever: ExperienceRetriever;
}
/**
 * Builds the default Nemons runtime with the built-in policy rules
 * and the MockAdapter pre-registered (NON-PRODUCTION).
 *
 * Options:
 *   - `registerMockAdapter` (default: true): whether to register the
 *     MockAdapter. Production deployments should pass `false` and
 *     register their own adapter(s) after construction.
 *   - `extraRules`: additional PolicyRules to register alongside the
 *     built-in baseline.
 */
export declare function buildRuntime(options?: {
    readonly registerMockAdapter?: boolean;
    readonly extraRules?: readonly import("./policy/policy-contracts.js").PolicyRule[];
}): NemonsRuntime;
//# sourceMappingURL=runtime.d.ts.map