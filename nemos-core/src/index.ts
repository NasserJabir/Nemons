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

// Core foundation
export * from "./core/identifiers.js";
export * from "./core/provenance.js";
export * from "./core/lifecycle.js";
export * from "./core/errors.js";

// Schemas
export * from "./schemas/index.js";

// Policy & Governance
export * from "./policy/index.js";

// Adapter Layer
export * from "./adapter/index.js";

// Context
export * from "./context/index.js";

// Run Manager
export * from "./run/index.js";

// Evidence
export * from "./evidence/index.js";

// Evaluation
export * from "./evaluation/index.js";

// Experience (Stage D)
export * from "./experience/index.js";

// Persistence (Stage E)
export * from "./persistence/index.js";

// Candidate Generation (links Stage D → Stage F)
export * from "./candidate-generation/index.js";

// Governed Evolution (Stage F)
export * from "./governed-evolution/index.js";

// Stage C — Local Execution Adapter (authorized by ADR-0006)
export * from "./stage-c/index.js";

// Runtime bootstrap
export * from "./runtime.js";

// Developer Interface (F-059)
export * from "./developer-interface.js";

// P2/P3 Features (F-001, F-015, F-051, F-045, F-050, F-062, F-056, F-030, F-037, F-063)
export * from "./p2-features.js";
