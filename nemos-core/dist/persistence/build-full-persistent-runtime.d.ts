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
import { type NemonsRuntime } from "../runtime.js";
import { PersistentExperienceStore } from "./persistent-experience-store.js";
import { PersistentCandidateStore } from "./persistent-candidate-store.js";
import { PersistentRunStore } from "./persistent-run-store.js";
import { PersistentEvidenceStore } from "./persistent-evidence-store.js";
import { DefaultCrossReferenceChecker } from "./cross-reference-checker.js";
import type { HealthCheckReport } from "./persistence-contract.js";
/**
 * Configuration for a fully-persistent runtime.
 */
export interface FullPersistentRuntimeOptions {
    /**
     * Root directory for all persistence. Sub-directories are created
     * for each store: runs/, evidence/, experiences/, candidates/.
     */
    readonly rootDir: string;
    /**
     * Whether to register the MockAdapter (NON-PRODUCTION).
     * Default: true.
     */
    readonly registerMockAdapter?: boolean;
    /**
     * Extra policy rules to register alongside the built-in baseline.
     */
    readonly extraRules?: readonly import("../policy/policy-contracts.js").PolicyRule[];
    /**
     * If true, runs a health check on each store during initialize().
     * Default: false.
     */
    readonly healthCheckOnStartup?: boolean;
}
/**
 * A Nemons runtime backed by persistent Run, Evidence, Experience,
 * and Candidate stores. Every operational knowledge record survives
 * restart.
 */
export interface FullPersistentRuntime {
    readonly policyEngine: NemonsRuntime["policyEngine"];
    readonly adapterRegistry: NemonsRuntime["adapterRegistry"];
    readonly runManager: NemonsRuntime["runManager"];
    readonly evidenceCollector: NemonsRuntime["evidenceCollector"];
    readonly evidenceValidator: NemonsRuntime["evidenceValidator"];
    readonly evaluationEngine: NemonsRuntime["evaluationEngine"];
    readonly experienceDeriver: NemonsRuntime["experienceDeriver"];
    readonly persistentRunStore: PersistentRunStore;
    readonly persistentEvidenceStore: PersistentEvidenceStore;
    readonly persistentExperienceStore: PersistentExperienceStore;
    readonly persistentCandidateStore: PersistentCandidateStore;
    readonly crossReferenceChecker: DefaultCrossReferenceChecker;
}
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
export declare function buildFullPersistentRuntime(options: FullPersistentRuntimeOptions): FullPersistentRuntime & {
    initialize(): Promise<{
        readonly runHealth?: HealthCheckReport;
        readonly evidenceHealth?: HealthCheckReport;
        readonly experienceHealth?: HealthCheckReport;
        readonly candidateHealth?: HealthCheckReport;
    }>;
};
export { hasOrphans, summarizeReport } from "./cross-reference-checker.js";
export type { CrossReferenceReport, CrossReferenceChecker } from "./cross-reference-checker.js";
//# sourceMappingURL=build-full-persistent-runtime.d.ts.map