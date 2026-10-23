/**
 * Nemons Persistence — Full Persistent Runtime bootstrap.
 *
 * `buildFullPersistentRuntime` constructs a Nemons runtime backed by
 * persistent Run, Evidence, Experience, and Candidate stores. ALL
 * operational knowledge records survive restart: a new instance at
 * the same persistence location loads previously-written records,
 * with state, references, content hashes, and review trails preserved.
 *
 * Architectural principles enforced here:
 *   - "Records survive restart" — all four stores (Run, Evidence,
 *     Experience, Candidate) are persisted.
 *   - "Reference consistency" — the CrossReferenceChecker can be
 *     run on startup to detect orphaned records before they're used.
 *   - "An incomplete record is not a verified success" — every store
 *     enforces its schema + invariants at the persistence boundary.
 *
 * Stage G: this bootstrap completes the persistent operational
 * knowledge surface. The full chain Run → Evidence → Evaluation →
 * Experience → Candidate → Governed Evolution can now be
 * reconstructed after restart.
 *
 * Note: Evaluations remain in-memory (they are per-Run computations,
 * not persistent operational knowledge). The CrossReferenceChecker
 * accepts an optional in-session Evaluation id set for the Experience
 * ↔ Evaluation consistency check.
 */
import { buildRuntime } from "../runtime.js";
import { FileSystemStore } from "./fs-json-store.js";
import { PersistentExperienceStore, experienceValidator, } from "./persistent-experience-store.js";
import { PersistentCandidateStore, candidateValidator, } from "./persistent-candidate-store.js";
import { PersistentRunStore, runValidator, } from "./persistent-run-store.js";
import { PersistentEvidenceStore, evidenceValidator, } from "./persistent-evidence-store.js";
import { DefaultCrossReferenceChecker, } from "./cross-reference-checker.js";
/**
 * Builds a fully-persistent Nemons runtime. ALL operational knowledge
 * records (Run, Evidence, Experience, Candidate) survive restart.
 *
 * The returned object's `initialize()` method MUST be called before
 * any persistent-store operation.
 *
 * Usage:
 *   const runtime = buildFullPersistentRuntime({ rootDir: "/data" });
 *   await runtime.initialize();
 *   const report = await runtime.crossReferenceChecker.check();
 *   if (hasOrphans(report)) {
 *     console.warn(summarizeReport(report));
 *   }
 */
export function buildFullPersistentRuntime(options) {
    const baseRuntime = buildRuntime({
        registerMockAdapter: options.registerMockAdapter,
        extraRules: options.extraRules,
    });
    // Persistent Run store
    const runBackend = new FileSystemStore({
        rootDir: `${options.rootDir}/runs`,
        validator: runValidator,
        healthCheckOnStartup: options.healthCheckOnStartup ?? false,
    });
    const persistentRunStore = new PersistentRunStore(runBackend);
    // Persistent Evidence store
    const evidenceBackend = new FileSystemStore({
        rootDir: `${options.rootDir}/evidence`,
        validator: evidenceValidator,
        healthCheckOnStartup: options.healthCheckOnStartup ?? false,
    });
    const persistentEvidenceStore = new PersistentEvidenceStore(evidenceBackend);
    // Persistent Experience store (already implemented in Stage E)
    const experienceBackend = new FileSystemStore({
        rootDir: `${options.rootDir}/experiences`,
        validator: experienceValidator,
        healthCheckOnStartup: options.healthCheckOnStartup ?? false,
    });
    const persistentExperienceStore = new PersistentExperienceStore(experienceBackend);
    // Persistent Candidate store (already implemented in Stage F extension)
    const candidateBackend = new FileSystemStore({
        rootDir: `${options.rootDir}/candidates`,
        validator: candidateValidator,
        healthCheckOnStartup: options.healthCheckOnStartup ?? false,
    });
    const persistentCandidateStore = new PersistentCandidateStore(candidateBackend);
    // The CrossReferenceChecker
    const crossReferenceChecker = new DefaultCrossReferenceChecker({
        runStore: persistentRunStore,
        evidenceStore: persistentEvidenceStore,
        experienceStore: persistentExperienceStore,
        candidateStore: persistentCandidateStore,
    });
    return {
        policyEngine: baseRuntime.policyEngine,
        adapterRegistry: baseRuntime.adapterRegistry,
        runManager: baseRuntime.runManager,
        evidenceCollector: baseRuntime.evidenceCollector,
        evidenceValidator: baseRuntime.evidenceValidator,
        evaluationEngine: baseRuntime.evaluationEngine,
        experienceDeriver: baseRuntime.experienceDeriver,
        persistentRunStore,
        persistentEvidenceStore,
        persistentExperienceStore,
        persistentCandidateStore,
        crossReferenceChecker,
        async initialize() {
            await runBackend.initialize();
            await evidenceBackend.initialize();
            await experienceBackend.initialize();
            await candidateBackend.initialize();
            if (options.healthCheckOnStartup) {
                const [runHealth, evidenceHealth, experienceHealth, candidateHealth] = await Promise.all([
                    runBackend.healthCheck(),
                    evidenceBackend.healthCheck(),
                    experienceBackend.healthCheck(),
                    candidateBackend.healthCheck(),
                ]);
                return { runHealth, evidenceHealth, experienceHealth, candidateHealth };
            }
            return {};
        },
    };
}
// Re-export for the public API
export { hasOrphans, summarizeReport } from "./cross-reference-checker.js";
//# sourceMappingURL=build-full-persistent-runtime.js.map