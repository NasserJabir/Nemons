# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — P3 readability, route split & honest surface

### Changed — zero minified modules remain

- The last 13 machine-compressed modules (golden-tasks, secret-detector,
  identity-manager, candidate-lifecycle, openapi-spec, redaction-v2,
  metrics, counterexample, state-manager, invariant-enforcer,
  approval-workflow, persona-builder, cbr) were formatted readable
  (prettier) and their minified identifiers renamed to meaningful ones
  (`N` → `NEMONS_HOME` via `runtime-config`, `P` → `SECRET_PATTERNS` /
  `SECRET_RULES`, `R` → `ROLE_TEMPLATES`, `D`/`E` → `NEMONS_HOME` /
  `EXPERIENCES_DIR` / `APPROVALS_DIR`). The lint readability guard's
  grandfather allowlist is now **empty** — new minified code cannot
  enter the tree, and none lives in it.

### Changed — server.js split into domain route modules

- `src/daemon/server.js` shrank **1290 → 560 lines**. The route table
  now lives in `src/daemon/routes/`: `research-v21.js`, `research-v23.js`,
  `research-v24.js`, `production-v25.js`, `platform-v40.js`,
  `core-bridge.js` — each extracted verbatim (order preserved) and
  registered through a shared context carrying the composition-root
  services and engine state.
- Seven more file-backed registries (`identity`, `candidateLifecycle`,
  `stateManager`, `toolContract`, `toolProviderContract`,
  `adapterContract`, `executionEnvironment`) moved from per-request
  `new X()` into the composition root.
- Verified live: one endpoint per route module (harness, kanban,
  subagent, unified-skills, pipeline, identity, /core/status) plus the
  full suite run (35+33+22+21+11) and `nemons verify` 10/10.

### Changed — honest product surface (README)

- README now separates the **product core loop** (`/analyze → /evidence
  → /evaluate → /experiences → /core/*`, fully tested) from the
  **experimental surface** (the research/endpoint breadth), which is
  explicitly not covered by version-stability guarantees. Consumers are
  directed to build on the core loop.

## [Unreleased] — P2 core polish (@nemons/core)

### Fixed — governed review decisions now survive a restart

- **`DefaultGovernedEvolutionEngine` no longer keeps review decisions in
  engine memory** (`src/governed-evolution/governed-evolution-engine.ts`):
  `recordReview` approvals were tracked in a private in-memory
  `Map<CandidateId, ReviewDecision[]>` — a process restart silently
  forgot every approval recorded so far, and an approval whose rules
  were not yet satisfied (e.g. waiting for a second reviewer) would
  never count again. Decisions are now derived from the candidate's
  **persisted review trail** (`provenance.reviewTrail` entries carrying
  a new optional `decision`/`comment` pair on `ReviewEntry`), so
  approval state survives any restart by construction.
- **Dead write removed**: the "approve but rules not yet satisfied"
  path built an updated `CandidateRecord` and **never stored it** (the
  code openly said "we work around by NOT storing the no-op update").
  Both stores now expose `appendReviewTrail(id, entry)` — the in-memory
  `CandidateStore` and `PersistentCandidateStore` (async, writes to
  disk) — and the engine uses it. The persisted view and the engine's
  view can no longer diverge.
- Proof tests (`tests/governed-evolution/review-decision-durability.test.ts`):
  D1 a denied approval is persisted in the STORE's trail; D2 a fresh
  engine over reloaded records completes a two-reviewer approval
  (restart equivalence); D3 `PersistentCandidateStore.appendReviewTrail`
  survives a backend reload from the same directory.

### Changed — the package is now consumable as an npm package

- `@nemons/core` package.json previously had **no `main`, `exports`,
  `types` or `files`** — Node could not resolve `@nemons/core` at all;
  consumers had to deep-import `dist/`. Added a proper `exports` map
  (types + import), `main`, `types`, `files: ["dist", "README.md"]`,
  and a `prepublishOnly` gate (typecheck + tests + build).
- CI `test-core` job gained a **consumer smoke test**: `npm pack` →
  install the tarball in a temp dir → `import('@nemons/core')` and
  assert the engine export is reachable (verified locally: 179 exports).

### Added — CI freshness guard for the committed dist/

- `nemos-core/dist/` is intentionally tracked (documented in
  `.gitignore`) so plugin users can run the daemon without a build
  step. The trade-off was silent staleness risk; the new `test-core`
  step builds fresh and `git diff --exit-code`s against the committed
  dist — a source change without a rebuild+commit now fails the gate.

### Added — property-based tests (fast-check)

- `tests/persistence/fs-json-store.property.test.ts` (3 properties,
  150 generated cases total): P1 round-trip of arbitrary JSON records;
  P2 contentHash is independent of key order at any depth; P3 hostile
  ids (traversal payloads + arbitrary garbage) can never escape the
  records directory. fast-check added as a devDependency.

## [Unreleased] — P1 daemon restructure

### Fixed — stateful endpoints that were functionally broken

- **Composition root** (`src/daemon/services.js`, new): 101 route
  handlers did `new Module()` per request, so every service keeping
  state in memory silently reset on each call — `/delegation/create`
  followed by `/delegation/authorize` lost the chain (`no_chain`),
  every `*/stats` endpoint reported empty stats forever, and
  ensemble/evolution histories never accumulated. All stateful
  services are now instantiated once at boot and injected into the
  handlers. Verified live: the delegation create→authorize flow now
  runs its 6 checks against the created chain.
- **`POST /investigate` ignored its request** and always investigated
  the literal string `"test"` — it now investigates
  `req.body.task || req.body.query`.

### Fixed — stored XSS in the dashboard

- The 450-line dashboard HTML embedded in `server.js` rendered
  experience ids/prompts via `innerHTML` — stored XSS via
  `POST /experiences` or `/evidence` payloads. The dashboard moved to
  `src/daemon/public/dashboard.html` (served via `sendFile`) and all
  dynamic rendering now builds DOM nodes with `textContent`.

### Added — central error handling

- JSON 404 for unmatched routes (was an HTML express default page).
- Express error middleware: anything a handler throws without its own
  try/catch now returns a JSON 500 instead of crashing or leaking a
  stack trace.

### Changed — single sources of truth

- **Port resolution** (`src/utils/runtime-config.js`, new): server.js,
  `daemon start`, `daemon stop` and `verify` each re-derived the port
  with different precedence (a config-file port made `start` poll the
  wrong port and `stop` check the wrong one). All now resolve through
  `resolvePort()`: explicit option > `NEMONS_PORT` env > config file >
  3456.
- **Home resolution**: 20 modules historically defaulted to `~/.nemos`
  while the daemon and storage layer used `~/.nemons` — data landed in
  two different roots. All modules now resolve through
  `nemonsHome()`, and `migrateLegacyHome()` folds legacy `~/.nemos`
  data into `~/.nemons` on first boot (only on the default home;
  explicit `NEMONS_HOME` is respected untouched).
- server.js shrank ~1757 → ~1290 lines; 34 dead requires removed.

### Changed — durable storage

- `storage.js` writes are atomic (temp file + rename): a crash
  mid-write can no longer leave truncated JSON records. The daemon's
  `/evidence` and `/experiences` writes route through the same helper,
  and storage filenames are validated against traversal.

### Changed — honest metrics and algorithms

- **`/metrics` no longer reports fiction**: `runs_total` was hardcoded
  to `0` and `verification_pass_rate` to `1.0`. Both now come from real
  in-process counters (plus new `intercepts_total`,
  `evidence_stored_total`); the pass rate is `null` until an
  evaluation has actually run.
- **Evolution engine honesty labels** (`evolution-engine.js`): MIPRO /
  AFlow scores are random placeholders — there is no evaluation
  backend. Responses now carry `score_source: "random_unmeasured"` and
  an explicit note; the fabricated `improvement` claim derived from the
  random score was removed. Module rewritten readable.
- Marketing pseudo-metrics removed from API responses:
  `"exfiltration_reduction":"75-100% → 0%"` (delegation-security
  stats), `"improvement":"up to 15%"` (`/harness/route`).

### Added — readability guard (CI-quality, local)

- `scripts/lint.js` now fails on any NEW file averaging > 200 chars per
  line (minified output). The 13 remaining minified modules are
  explicitly grandfathered in an allowlist in the script — the debt is
  visible and new minified code cannot sneak in. (evolution-engine,
  kanban-board, a2a-protocol, rate-limiter have already been rewritten
  readable.)

## [Unreleased] — P0 security & correctness hardening

### Security (all previously verified live-exploitable, now gated by `tests/security-tests.js`)

- **Path traversal WRITE via `POST /evidence`** (`src/daemon/server.js`):
  `run_id` was interpolated directly into a file path; `"../../x"` wrote
  attacker-controlled JSON outside `NEMONS_HOME`. Now rejected with 400
  by `isSafeId()` + `resolveWithin()` containment.
- **Path traversal READ via `GET /context-pack/:id`** (`src/daemon/server.js`):
  an encoded `..%2f..%2f` id read arbitrary files outside the home dir.
  Now rejected with 400.
- **Unvalidated ids in filenames** (`src/utils/kanban-board.js`,
  `src/utils/a2a-protocol.js`): `POST /kanban/create`, `/kanban/:id/move`,
  `/a2a/register` and `/a2a/:id/send` interpolated body/route-supplied ids
  into file paths. Both modules now validate ids with `isSafeId()` and the
  route-param endpoints return 400 before the module is reached.
- **New `src/utils/path-guard.js`**: single choke point for every
  filesystem-touching endpoint — `isSafeId()` (fail-fast id validation)
  and `resolveWithin()` (defense-in-depth path containment).
- **Timing-leaky token compare** (`src/daemon/server.js`): the bearer-token
  check used `!==`, leaking token length/prefix through response timing.
  Now uses `crypto.timingSafeEqual` with length-independent burn path.
  Also accepts `X-Nemons-Token` as an alternative header.
- **RateLimiter existed but was never wired** (`src/utils/rate-limiter.js`,
  `src/daemon/server.js`): it is now shared-instance express middleware
  (per-endpoint sliding window, default 60 req/min, `NEMONS_RATE_MAX` /
  `NEMONS_RATE_WINDOW_MS` overrides). Exceeding it returns 429 +
  `Retry-After`. `/rate-limit/stats` now reports the live instance
  (previously instantiated a fresh limiter per request and always
  reported zero).

### Fixed

- **Broken e2e suites now pass and run in CI**:
  - `POST /evaluate` returned the verifier's `pass` field while
    `tests/run-all.js` and `src/commands/verify.js` asserted `passed` —
    both e2e suites failed even though the README claimed "1305/1305
    tests passing" (CI never ran them). The API now returns `pass`
    (canonical) plus a `passed` alias and a `failures` list; tests
    assert the canonical field.
  - **Verifier tri-state verdict** (`src/utils/verifier.js`): a missing
    response/context made the grounding layer report a hard `fail`,
    so evidence-only verification always returned `pass:false` even
    with all deterministic evidence passing. Grounding now reports
    `status:"inconclusive"` for missing inputs; every layer carries
    `status: "pass" | "fail" | "inconclusive"`; the overall result adds
    `verdict` and `inconclusive_layers`. Definitive fails gate the
    verdict exactly as before.
  - `nemons verify` hardcoded port 3456 and ignored `NEMONS_PORT` —
    it could never test a daemon on a custom port. It now honors
    `NEMONS_PORT`.
- **`npm run lint` failed on Windows** ("f was unexpected at this time"):
  the bash for-loop is replaced by `scripts/lint.js` (cross-platform,
  also covers `tests/`).

### Changed — CI

- The daemon test job now runs `tests/security-tests.js` and the e2e
  `npm test` (run-all) suite — the two suites whose failures previously
  shipped undetected.
- Smoke test now runs `nemons verify` against the live daemon.
- New **Windows job** (`test-daemon-windows`): lint + all four in-process
  suites run on windows-latest (the installers claim Windows support but
  nothing in CI ran there). Daemon spawn/stop e2e remains on the unix
  matrix until its SIGTERM lifecycle is hardened for Windows.

### Added — tests

- `tests/security-tests.js` (21 tests): path-guard units, traversal
  write/read regressions on every file-touching endpoint, escaped-file
  non-creation assertions, auth (401 without/wrong token, both header
  forms, health exemption), rate-limit tripping, shared-instance stats.
  Wired into `npm run test:all` and CI.

## [4.2.1] - 2026-10-23

### Fixed — comment/code drift in v4.2.0
The v4.2.0 release shipped with comments claiming to "pass persona role
to harness router" and "pass persona to orchestrator" but the actual
call sites still only passed `prompt`. v4.2.1 closes this drift:

- **HarnessRouter** (`src/utils/harness-router.js`):
  - `route(prompt, personaRole?)` now accepts an optional personaRole
    argument (was prompt-only). Persona is now a FIRST-CLASS routing
    input.
  - Verification criteria augmentation moved INSIDE the router
    (centralised `PERSONA_DOMAIN_CRITERIA` map). Direct callers benefit,
    not just `pipeline-integrator.js`.
  - The router response now includes `persona_role`, `persona_domain`,
    and `persona_augmented` so callers can audit WHO drove routing.
  - New exports: `PERSONA_DOMAIN_CRITERIA`, `ROLE_TO_DOMAIN`.
  - New method: `getPersonaDomainCriteria(domain)` for introspection.
- **SubagentOrchestrator** (`src/utils/subagent-orchestrator.js`):
  - `autoOrchestrate(task, dagPlan, identityId, personaRole?)` now
    accepts an optional personaRole argument (was 3-arg only).
  - Persona-driven role/memory_mode/capabilities override is now
    applied AT SPAWN TIME inside `createAssignments` (was post-hoc
    in the caller only).
  - Orchestration record now carries `persona_role`, `persona_domain`,
    `persona_driven` provenance.
  - Non-orchestrated result (simple task) still echoes persona context.
  - `stats()` now reports `persona_driven_orchestrations` count and
    `persona_domain_breakdown` map.
  - New exports: `PERSONA_ROLE_DOMAIN`, `DOMAIN_ROLE_OVERRIDE`.
- **PipelineIntegrator** (`src/utils/pipeline-integrator.js`):
  - Actually passes `persona.role` to `harnessRouter.route(prompt, persona.role)`
    (was `route(prompt)` despite the comment claiming otherwise).
  - Actually passes `persona.role` to `subagentOrchestrator.autoOrchestrate(prompt, dag, id, persona.role)`
    (was 3-arg call despite the comment claiming otherwise).
  - `augmentCriteriaForPersona(null, persona)` no longer drops persona
    criteria silently — falls back to a sane default THEN merges persona
    criteria on top (closes a real bug).
  - Subagent records now carry `orchestrator_overridden` and `base_role`
    provenance so audit trail shows whether the role was set at spawn
    time or post-spawn.
  - `pipeline_version` bumped to `4.2.1`; `stats()` description updated.

### Added
- New test file: `tests/v421-persona-tests.js` — 33 tests covering
  harness router persona-aware routing, orchestrator spawn-time persona
  override, pipeline-integrator helper functions, and end-to-end
  persona provenance.
- New npm scripts: `test:unit` (legacy), `test:v421` (new).

### Fixed (pre-existing)
- `src/utils/unified-skills.js:27` — pre-existing syntax error
  (`{ recursive: true)` missing closing brace) that prevented
  `pipeline-integrator.js` from loading.

### Backward Compatibility
- All v4.2.0 callers continue to work unchanged (personaRole is
  optional in both `route()` and `autoOrchestrate()`).
- When personaRole is omitted, behaviour is identical to v4.1.0.

## [4.2.0] - 2026-10-23

### Added — persona-driven pipeline
This release made persona the DRIVER of skill / experience / harness /
subagent selection. Previously these modules worked independently
based on prompt keywords.

- **PipelineIntegrator** (`src/utils/pipeline-integrator.js`):
  - Persona selection via `selectPersonaRole(prompt)` → 5 roles
    (security / devops / data / frontend / senior engineer).
  - Dynamic persona creation via `PersonaEvolver` when template is
    too generic (e.g. "senior_engineer" for a security task).
  - Skill retrieval by persona domain (`${persona.domain} ${prompt}`).
  - Experience retrieval by persona domain.
  - Harness verification criteria augmented by persona domain
    (4 domains: security / devops / data-engineering / frontend).
  - Subagent roles augmented post-spawn via `augmentSubagentRole`.
  - Persona provenance recorded on every component of the Context Pack.

### Known Gaps Closed in v4.2.1
- Harness router did not actually accept personaRole (comment claimed it did).
- Subagent orchestrator did not actually accept personaRole (comment claimed it did).
- `augmentCriteriaForPersona(null, persona)` silently dropped persona criteria.

## [4.1.0] - 2026-10-22

### Added — self-evolution
- PersonaEvolver: dynamic persona creation + evolution + gap detection.
- SubagentOrchestrator: auto-spawn + parallel + merge + retry.
- SkillEvolver: gap detection + evolution + proactive creation.

## [4.0.0] - 2026-10-22

### Added — pipeline integration
- `/analyze` builds dynamic Context Packs with persona + skills +
  experiences + harness + subagents + DAG.
- `/evaluate` auto-compiles experiences to skills + notifies webhooks.

## [1.0.0] - 2026-10-22

### Added
- ✅ Initial release of Nemons CLI
- ✅ Express daemon with full REST API (9 endpoints)
- ✅ Transparent prompt interception (auto-trigger on every prompt)
- ✅ Smart filtering (skips trivial prompts like "hello", "what is")
- ✅ Context Pack auto-selection based on prompt keywords
- ✅ Evidence collection (diffs, tests, lint) with auto-secret-redaction
- ✅ 3-tier verification loop (must-pass / should-pass / nice-to-have)
- ✅ Experience storage (file-based JSON in `~/.nemons/experiences/`)
- ✅ Hierarchical governance (low/medium/high impact approval)
- ✅ Monitoring with metrics + alerting
- ✅ 7 CLI commands: daemon, health, plugin, intercept, verify, install, experiences
- ✅ 10-test end-to-end verification suite
- ✅ Plugins for 7 coding agents: OpenCode, Claude Code, Codex, Kimi, Cline, Qoder, Trae
- ✅ systemd service file (Linux)
- ✅ launchd plist (macOS)
- ✅ SDK public API for embedding in Node.js apps
- ✅ Documentation: architecture, API reference, plugin development

### Security
- Daemon binds to 127.0.0.1 only (no remote access)
- Optional bearer token authentication
- Automatic secret redaction (API keys, JWTs, PEM files, AWS keys)
- Audit logs with hash chain (tamper-proof)
- RBAC tool-level permissions (planned for 1.1.0)

### Performance
- File-based storage (no DB dependency)
- In-memory context pack caching (1-hour TTL)
- Graceful degradation (plugin no-ops if daemon unreachable)
- Lazy loading of skills and experiences

### Documentation
- README.md with full installation guide
- docs/architecture.md with system overview
- docs/api-reference.md with all REST endpoints
- docs/plugin-development.md with examples
- examples/custom-context-pack.yml
- examples/sdk-usage.js

## [0.9.0] - 2026-10-21 (Pre-release)

### Added
- Initial project structure
- Skeleton daemon implementation
- Basic CLI commands

## Future Roadmap

### [1.1.0] — Q4 2026
- RBAC tool-level permissions
- Multi-tenant support
- PostgreSQL backend (optional)
- WebSocket for real-time metrics
- Web dashboard (React)

### [1.2.0] — Q1 2027
- Distributed daemon (cluster mode)
- AI-powered experience ranking
- Auto-skill derivation from successful runs
- Integration with Augment Cosmos
