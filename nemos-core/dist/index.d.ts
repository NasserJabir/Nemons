/**
 * Nemons Core — public entry point.
 *
 * Exports the full surface of the @nemons/core package:
 *   - Core foundation types (identifiers, provenance, lifecycle, errors)
 *   - All 7+ schemas (Persona, Skill, Knowledge, Memory, Context Pack,
 *     Run, Evidence, Evaluation, Experience)
 *   - Policy & Governance (decision, contracts, engine, built-in rules)
 *   - Adapter Layer (contract, registry, mock adapter)
 *   - Context (resolver, pack builder)
 *   - Run Manager
 *   - Evidence (collector, validator)
 *   - Evaluation Engine
 *   - Runtime bootstrap
 *
 * The package's public API is intentionally narrow at the entry point:
 * consumers should import from the sub-paths when they only need a
 * subset (e.g., `@nemons/core/schemas`).
 */
export * from "./core/identifiers.js";
export * from "./core/provenance.js";
export * from "./core/lifecycle.js";
export * from "./core/errors.js";
export * from "./schemas/index.js";
export * from "./policy/index.js";
export * from "./adapter/index.js";
export * from "./context/index.js";
export * from "./run/index.js";
export * from "./evidence/index.js";
export * from "./evaluation/index.js";
export * from "./experience/index.js";
export * from "./persistence/index.js";
export * from "./candidate-generation/index.js";
export * from "./governed-evolution/index.js";
export * from "./stage-c/index.js";
export * from "./runtime.js";
export * from "./developer-interface.js";
export * from "./p2-features.js";
//# sourceMappingURL=index.d.ts.map