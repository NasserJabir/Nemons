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

import { buildRuntime, type NemonsRuntime } from "../runtime.js";
import { FileSystemStore } from "./fs-json-store.js";
import {
  PersistentExperienceStore,
  experienceValidator,
} from "./persistent-experience-store.js";
import {
  PersistentCandidateStore,
  candidateValidator,
} from "./persistent-candidate-store.js";
import {
  PersistentRunStore,
  runValidator,
} from "./persistent-run-store.js";
import {
  PersistentEvidenceStore,
  evidenceValidator,
} from "./persistent-evidence-store.js";
import {
  DefaultCrossReferenceChecker,
} from "./cross-reference-checker.js";
import type { Run } from "../schemas/run.js";
import type { Evidence } from "../schemas/evidence.js";
import type { Experience } from "../schemas/experience.js";
import type { CandidateRecord } from "../schemas/candidate.js";
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
  // The base runtime (with persistent Experience + Candidate overrides)
  readonly policyEngine: NemonsRuntime["policyEngine"];
  readonly adapterRegistry: NemonsRuntime["adapterRegistry"];
  readonly runManager: NemonsRuntime["runManager"];
  readonly evidenceCollector: NemonsRuntime["evidenceCollector"];
  readonly evidenceValidator: NemonsRuntime["evidenceValidator"];
  readonly evaluationEngine: NemonsRuntime["evaluationEngine"];
  readonly experienceDeriver: NemonsRuntime["experienceDeriver"];

  // Persistent stores (Stage E + F + G)
  readonly persistentRunStore: PersistentRunStore;
  readonly persistentEvidenceStore: PersistentEvidenceStore;
  readonly persistentExperienceStore: PersistentExperienceStore;
  readonly persistentCandidateStore: PersistentCandidateStore;

  // The CrossReferenceChecker
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
export function buildFullPersistentRuntime(
  options: FullPersistentRuntimeOptions,
): FullPersistentRuntime & {
  initialize(): Promise<{
    readonly runHealth?: HealthCheckReport;
    readonly evidenceHealth?: HealthCheckReport;
    readonly experienceHealth?: HealthCheckReport;
    readonly candidateHealth?: HealthCheckReport;
  }>;
} {
  const baseRuntime = buildRuntime({
    registerMockAdapter: options.registerMockAdapter,
    extraRules: options.extraRules,
  });

  // Persistent Run store
  const runBackend = new FileSystemStore<Run & { id: string }>({
    rootDir: `${options.rootDir}/runs`,
    validator: runValidator as unknown as (r: unknown) => asserts r is Run & { id: string },
    healthCheckOnStartup: options.healthCheckOnStartup ?? false,
  });
  const persistentRunStore = new PersistentRunStore(runBackend);

  // Persistent Evidence store
  const evidenceBackend = new FileSystemStore<Evidence & { id: string }>({
    rootDir: `${options.rootDir}/evidence`,
    validator: evidenceValidator as unknown as (e: unknown) => asserts e is Evidence & { id: string },
    healthCheckOnStartup: options.healthCheckOnStartup ?? false,
  });
  const persistentEvidenceStore = new PersistentEvidenceStore(evidenceBackend);

  // Persistent Experience store (already implemented in Stage E)
  const experienceBackend = new FileSystemStore<Experience & { id: string }>({
    rootDir: `${options.rootDir}/experiences`,
    validator: experienceValidator as unknown as (e: unknown) => asserts e is Experience & { id: string },
    healthCheckOnStartup: options.healthCheckOnStartup ?? false,
  });
  const persistentExperienceStore = new PersistentExperienceStore(experienceBackend);

  // Persistent Candidate store (already implemented in Stage F extension)
  const candidateBackend = new FileSystemStore<CandidateRecord & { id: string }>({
    rootDir: `${options.rootDir}/candidates`,
    validator: candidateValidator as unknown as (c: unknown) => asserts c is CandidateRecord & { id: string },
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
export type { CrossReferenceReport, CrossReferenceChecker } from "./cross-reference-checker.js";
