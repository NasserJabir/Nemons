// ============================================================
// Nemos Bridge — JS-side adapter for the @nemons/core TS package
//
// This file is the SINGLE boundary where the daemon's CommonJS
// world meets the TS core's ESM world. All daemon-side modules
// that want to use the rich TS features (governed evolution,
// persistent stores, paired evaluator, action interception, P2
// features, etc.) go through THIS file rather than reaching into
// the dist/ directly.
//
// Why a bridge?
//   - The TS core is ESM (type: module). The daemon is CommonJS.
//     require() cannot load ESM directly.
//   - We use dynamic import() which is async in CommonJS.
//   - We pre-resolve at startup and CACHE the namespace so all
//     subsequent bridge calls are synchronous (no per-call async).
//   - If the core is not built (npm run build not run yet, or the
//     consumer only installed the JS daemon without the TS side),
//     the bridge reports a clear, actionable error rather than
//     crashing.
//
// What the bridge exposes (subset of @nemons/core most useful to
// the JS daemon):
//   - buildPersistentRuntime() — Stage E runtime bootstrap
//   - buildFullPersistentRuntime() — full persistent runtime
//   - GovernedEvolutionEngine — Stage F propose/review/approve/supersede/rollback
//   - CandidateStore + PersistentCandidateStore
//   - DefaultCandidateGenerator — Experience → Candidate
//   - EvaluationEngine + PairedEvaluator + OfflineSkillEvaluator
//   - DefaultActionInterceptor + isActionAllowed + isActionDenied
//   - InMemoryProjectStore + checkRunBudget + detectRegression +
//     checkPermission + buildLineage + reconstructRun + runAblation
//   - DefaultDeveloperInterface — Stage F-059 CLI helpers
//   - schema validators (validatePersona, validateSkill, etc.)
// ============================================================

const path = require("path");
const fs = require("fs");

// Resolve candidate locations for the @nemons/core dist root.
// The bridge sits at nemos/src/utils/nemos-bridge.js, so:
//   __dirname = <repo>/nemos/src/utils/
// To reach <repo>/nemos-core/dist/ we need to go up THREE levels
// (utils -> src -> nemos -> repo root), then into the sibling nemos-core/ directory.
// The previous version had only ONE ".." which pointed to
// <repo>/nemos/nemos-core/dist - a directory that did not exist.
// (An even earlier version had TWO ".." which still pointed into nemos/.)
// It worked in the dev sandbox only because the third hardcoded
// candidate (/home/z/my-project/dist) happened to be available.
//
// v4.2.1-fix: corrected the sibling-directory path + removed the
// dev-sandbox fallback (production deployments should not depend
// on a hardcoded absolute path). Added an NEMONS_CORE_DIST env
// override so users can point at a custom-built core if needed.
const CORE_DIST_CANDIDATES = [
  // 1. Env override (highest priority - explicit user intent)
  process.env.NEMONS_CORE_DIST,
  // 2. Sibling directory in monorepo layout:
  //    __dirname = <repo>/nemos/src/utils/
  //    3x ".." -> <repo>/
  //    then nemos-core/dist -> <repo>/nemos-core/dist
  path.resolve(__dirname, "..", "..", "..", "nemos-core", "dist"),
  // 3. Daemon-local install (npm install @nemons/core inside nemos/):
  //    2x ".." -> <repo>/nemos/
  //    then node_modules/@nemos/core/dist
  path.resolve(__dirname, "..", "..", "node_modules", "@nemos", "core", "dist"),
  // 4. Repo-root install:
  //    3x ".." -> <repo>/
  //    then node_modules/@nemos/core/dist
  path.resolve(__dirname, "..", "..", "..", "node_modules", "@nemos", "core", "dist"),
].filter(Boolean);

function findCoreDist() {
  for (const candidate of CORE_DIST_CANDIDATES) {
    try {
      if (fs.existsSync(path.join(candidate, "index.js"))) {
        return candidate;
      }
    } catch {}
  }
  return null;
}

const CORE_DIST_PATH = findCoreDist();

// Cached namespace + load state. Once loadCore() resolves, all
// subsequent bridge calls read from `coreNS` synchronously.
let coreNS = null;
let loadPromise = null;
let loadError = null;

/**
 * Load the @nemons/core namespace (async — must be awaited once
 * at startup). After this resolves, bridge.* calls are synchronous.
 *
 * @returns {Promise<object>} the full @nemons/core namespace
 * @throws {Error} if the core dist cannot be located
 */
async function loadCore() {
  if (coreNS) return coreNS;
  if (loadPromise) return loadPromise;
  if (loadError) throw loadError;

  if (!CORE_DIST_PATH) {
    loadError = new Error(
      "Nemos Bridge: @nemons/core dist not found.\n" +
      "Looked in:\n  - " + CORE_DIST_CANDIDATES.join("\n  - ") + "\n" +
      "Run `npm run build` in the @nemons/core package directory first, " +
      "or install @nemons/core as a dependency."
    );
    throw loadError;
  }

  loadPromise = (async () => {
    const indexPath = path.join(CORE_DIST_PATH, "index.js");
    coreNS = await import("file://" + indexPath);
    return coreNS;
  })().catch((e) => {
    loadError = new Error("Nemos Bridge: failed to import @nemons/core: " + e.message);
    throw loadError;
  });

  return loadPromise;
}

/**
 * Synchronous accessor for an already-loaded core. Throws if
 * loadCore() hasn't been awaited yet.
 */
function requireCore() {
  if (loadError) throw loadError;
  if (!coreNS) {
    throw new Error(
      "Nemos Bridge: @nemons/core not loaded yet. Call `await bridge.loadCore()` at startup before any bridge API."
    );
  }
  return coreNS;
}

// ============================================================
// Bridge API — thin synchronous wrappers over requireCore().
// Each function pulls exactly one symbol from the core namespace
// and exposes it in a JS-friendly way. The wrappers are intentionally
// minimal — the daemon's existing utils/ are still used for
// prompt-time hot path; the bridge is for the SLOW PATH that the
// JS daemon didn't have before (governed evolution, persistent
// stores, regression detection, ablation, import/export, etc.).
// ============================================================

const bridge = {
  // === Lifecycle ===
  loadCore,
  isLoaded: () => coreNS !== null,
  corePath: () => CORE_DIST_PATH,

  // === Runtime Bootstrap (Stage E) ===
  /**
   * Build a persistent runtime. Returns an object with:
   *   runtime (PersistentNemonsRuntime), initialize(), shutdown()
   * Caller MUST await runtime.initialize() before any Experience op.
   */
  async buildPersistentRuntime(options) {
    const core = requireCore();
    const built = await core.buildPersistentRuntime(options || {});
    return built;
  },

  // === Governed Evolution (Stage F) ===
  createGovernedEvolutionEngine: (options = {}) => {
    const core = requireCore();
    const engine = new core.DefaultGovernedEvolutionEngine(
      options.candidateStore || new core.InMemoryCandidateStore(),
      options.approvalPolicy || {},
      options.conflictDetector || new core.DefaultConflictDetector(),
      options.conflictResolver || new core.DefaultConflictResolutionEngine(),
      options.decisionLog || new core.InMemoryDecisionLog()
    );
    return engine;
  },

  createCandidateStore: () => new (requireCore().InMemoryCandidateStore)(),
  createPersistentCandidateStore: (options) => new (requireCore().PersistentCandidateStore)(options),
  createCandidateGenerator: (options) => new (requireCore().DefaultCandidateGenerator)(options || {}),

  // === Evaluation (Stage B research improvements) ===
  createEvaluationEngine: (options) => new (requireCore().DefaultEvaluationEngine)(options || {}),
  createPairedEvaluator: (options) => new (requireCore().PairedEvaluator)(options || {}),
  createOfflineSkillEvaluator: (options) => new (requireCore().OfflineSkillEvaluator)(options || {}),

  // === Action Interception (ADR-0016) ===
  createActionInterceptor: (options) => new (requireCore().DefaultActionInterceptor)(options || {}),
  isActionAllowed: (verdict) => requireCore().isActionAllowed(verdict),
  isActionDenied: (verdict) => requireCore().isActionDenied(verdict),

  // === Schema validators ===
  validatePersona: (p) => requireCore().validatePersona(p),
  validateSkill: (s) => requireCore().validateSkill(s),
  validateRun: (r) => requireCore().validateRun(r),
  validateEvidence: (e) => requireCore().validateEvidence(e),
  validateExperience: (x) => requireCore().validateExperience(x),
  validateCandidate: (c) => requireCore().validateCandidate(c),
  validateContextPack: (cp) => requireCore().validateContextPack(cp),

  // === P2 Features (F-001, F-015, F-051, F-045, F-050, F-062, F-056, F-030, F-037, F-063) ===
  P2: () => {
    const core = requireCore();
    return {
      InMemoryProjectStore: core.InMemoryProjectStore,
      DEFAULT_CONTEXT_BUDGET: core.DEFAULT_CONTEXT_BUDGET,
      optimizeForBudget: core.optimizeForBudget,
      checkRunBudget: core.checkRunBudget,
      detectRegression: core.detectRegression,
      checkPermission: core.checkPermission,
      DEFAULT_RUNTIME_CONFIG: core.DEFAULT_RUNTIME_CONFIG,
      buildLineage: core.buildLineage,
      reconstructRun: core.reconstructRun,
      runAblation: core.runAblation,
      exportAssets: core.exportAssets,
      importAssets: core.importAssets,
    };
  },

  // === Developer Interface (F-059) ===
  createDeveloperInterface: (runtime) => new (requireCore().DefaultDeveloperInterface)(runtime),

  // === Provenance / Lifecycle / Identifiers (core foundation) ===
  freshId: (kind) => requireCore().freshId(kind),
  // v4.2.1: the TS core exposes sha256Hex (not sha256) — match the real name.
  sha256: (s) => requireCore().sha256Hex(s),
  sha256Hex: (s) => requireCore().sha256Hex(s),
  isApproved: (record) => requireCore().isApproved(record),
  isDeprecated: (record) => requireCore().isDeprecated(record),
  transitionProvenance: (from, kind) => requireCore().transitionProvenance(from, kind),
};

module.exports = bridge;
