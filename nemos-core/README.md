# @nemons/core — TypeScript Core Package

This is the formal, fully-tested TypeScript implementation of the Nemos runtime.
It is **independent** of the JS daemon in `../nemos/` — the daemon uses it via
the bridge shim in `../nemos/src/utils/nemos-bridge.js`, but the core can also
be used directly as an NPM package.

## Status

**Stage 0–I + 10 research-driven improvements + all P0/P1/P2/P3 features
implemented.**

- **72 source files** in `src/`
- **68 test files** in `tests/` (1215 tests, all passing)
- **16 ADRs** in `docs/adr/`
- **9 stage reports** in `docs/reports/` (Stage 0 through Stage I)
- **Research-driven improvements** backed by 10 verified arXiv papers

## Architecture

```
src/
├── core/                # Foundation: identifiers, provenance, lifecycle, errors
├── schemas/             # 9 domain schemas with validators
├── policy/              # Governance: hard-deny + 5 built-in rules
├── adapter/             # Adapter contract + mock adapter + action interception
├── context/             # Context resolver + pack builder
├── run/                 # Run manager + verification loop controller
├── evidence/            # Evidence collector + validator
├── evaluation/          # Evaluation engine + paired evaluator + offline skill evaluator
├── experience/           # Stage D: experience deriver + store + retriever + memory bridge
├── persistence/          # Stage E: persistent stores + health checks
├── governed-evolution/   # Stage F: candidate store + governed evolution engine
├── candidate-generation/ # Stage D→F link: experience → candidate
├── stage-c/              # Local execution adapter (ADR-0006)
├── p2-features.ts        # F-001, F-015, F-051, F-045, F-050, F-062, F-056, F-030, F-037, F-063
├── developer-interface.ts # F-059: listRuns/inspectRun/healthCheck etc.
├── runtime.ts            # buildRuntime() bootstrap
└── index.ts              # public entry — exports everything
```

## Pre-built dist/

A pre-built `dist/` directory is included so the JS daemon bridge works
without requiring a build step. The dist contains:

- `index.js` + `index.d.ts` — public entry
- One folder per source module, each with `.js` + `.d.ts` + `.map` files

To rebuild from source:

```bash
cd nemos-core/
npm install
npm run build      # → tsc -p tsconfig.json → dist/
npm test           # → vitest run → 1215 tests
```

## Using the core directly

```ts
import { buildRuntime, freshId, sha256Hex, validatePersona } from "@nemons/core";

const runtime = buildRuntime({
  adapter: myAdapter,
  personaStore: myStore,
});

const runId = freshId("RunId");
const personaHash = sha256Hex(JSON.stringify(personaJson));
```

## Bridge from the JS daemon

The JS daemon at `../nemos/` does NOT import the core directly. It uses the
bridge at `../nemos/src/utils/nemos-bridge.js` which:

1. Loads `nemos-core/dist/index.js` via dynamic `import()`
2. Caches the namespace so all bridge calls are synchronous
3. Reports a clear error if dist/ is missing

See `../nemos/src/utils/nemos-bridge.js` for the full bridge surface.

## Tests

```bash
cd nemos-core/
npm test
# → 68 test files, 1215 tests, all passing
```

Test categories:
- **Stage 0** — Core foundation (277 tests)
- **Stage B** — Contract integrity (304 tests)
- **Stage D** — Evidence→Experience lifecycle (92 tests)
- **Stage E** — Persistent storage (38 tests)
- **Stage F** — Governed evolution (86 tests)
- **Extensions** — Persistent candidate store + candidate generator (44 tests)
- **Research improvements** — 10 ADRs from arXiv papers (176 tests)
- **Assessment gaps + P2/P3 features** — 198 tests

## Documentation

- `docs/adr/` — 16 Architecture Decision Records
- `docs/stage-*-report.md` — 9 stage reports (one per implementation stage)
- `docs/assessment/feature-assessment.md` — 64-feature architectural assessment
- `docs/research/` — Research notes from arXiv paper review

## Architectural Invariants (Non-Negotiable)

1. **Agent independence** — adapter contract is the only thing that touches the Coding Agent
2. **Model independence** — Core has no model-provider dependencies
3. **Explicit boundaries** — integrations pass through documented interfaces
4. **Hard-deny security** — `enforceDecision` throws on any non-allow outcome
5. **Persona is not permission** — selecting a Persona does NOT authorize protected operations
6. **Observed is not enforced** — the engine RETURNS the decision; effects happen at the call site
7. **Use is not adoption** — using a candidate asset does NOT make it approved
8. **Retrieved is not approved** — retrieval preserves provenance kind
9. **No silent mutation** — `promote()`/`transition()` are the only sanctioned lifecycle changes
10. **Evidence before claims** — `markSucceeded` requires Evidence; `ExperienceDeriver` requires verified Evaluation; `CandidateGenerator` requires approved Experience
11. **Identity is not instance** — branded types distinguish asset ids from runtime instances
12. **Privacy by design** — Context Pack resource constraints + data minimization
13. **Verification over appearance** — `claimed_succeeded_unverified` is distinct from `verified_succeeded`
14. **Incremental implementation** — each stage produced testable, reviewable outcomes

All 14 are enforced by tests, not just documentation.

## License

MIT — see `../LICENSE`.
