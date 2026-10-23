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
import { InMemoryPolicyRuleRegistry } from "./policy/policy-contracts.js";
import { DefaultPolicyEngine } from "./policy/policy-engine.js";
import { BUILTIN_POLICY_RULES } from "./policy/builtin-rules.js";
import { InMemoryAdapterRegistry } from "./adapter/adapter-registry.js";
import { MockAdapter } from "./adapter/mock-adapter.js";
import { InMemoryRunManager } from "./run/run-manager.js";
import { DefaultEvidenceCollector } from "./evidence/evidence-collector.js";
import { DefaultEvidenceValidator } from "./evidence/evidence-validator.js";
import { DefaultEvaluationEngine } from "./evaluation/evaluation-engine.js";
import { InMemoryExperienceStore } from "./experience/experience-store.js";
import { DefaultExperienceDeriver } from "./experience/experience-deriver.js";
import { DefaultExperienceRetriever } from "./experience/experience-retriever.js";
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
export function buildRuntime(options) {
    const registry = new InMemoryPolicyRuleRegistry();
    for (const rule of BUILTIN_POLICY_RULES) {
        registry.register(rule);
    }
    for (const rule of options?.extraRules ?? []) {
        registry.register(rule);
    }
    const policyEngine = new DefaultPolicyEngine(registry);
    const adapterRegistry = new InMemoryAdapterRegistry();
    if (options?.registerMockAdapter ?? true) {
        adapterRegistry.register(new MockAdapter());
    }
    const runManager = new InMemoryRunManager(policyEngine);
    const evidenceCollector = new DefaultEvidenceCollector();
    const evidenceValidator = new DefaultEvidenceValidator();
    const evaluationEngine = new DefaultEvaluationEngine();
    // Stage D: Experience lifecycle components
    const experienceStore = new InMemoryExperienceStore();
    const experienceDeriver = new DefaultExperienceDeriver();
    const experienceRetriever = new DefaultExperienceRetriever(experienceStore);
    return {
        policyEngine,
        adapterRegistry,
        runManager,
        evidenceCollector,
        evidenceValidator,
        evaluationEngine,
        experienceStore,
        experienceDeriver,
        experienceRetriever,
    };
}
//# sourceMappingURL=runtime.js.map