# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — QODER-03: architecture remediation plan (planning only, nothing implemented)

A dependency-aware plan that translates the QODER-02 audit into a sequenced remediation:
`docs/07-evaluation/experiments/QODER-03-architecture-remediation-plan.md`. No source file was changed,
no store was written, no asset was adopted, and no migration was run.

- **Twelve findings** (`F-01`–`F-12`), each recorded with root cause and line references, affected
  modules and contracts, existing behaviour, intended behaviour, inter-finding dependencies, the tests
  that exist today, and the regression tests that do not. `components_used` has no test at all — a
  grep over `nemos/tests/` returns zero references, which is why it was never falsified.
- **The structural axis.** `nemos-core` already specifies the whole object graph the audit found
  missing (Project, Run, Evidence, Evaluation, Experience, `RepositoryIdentity`, resolver, pack
  builder, hash-verified stores, 70 vitest files). The daemon consumes exactly one of those
  capabilities on the serving path. The findings are consequences of that, not independent defects,
  so the plan is organised around one decision (`D-01`) and Phase A is written to be valid either way.
- **New evidence.** `skills/tdd.json` is a conformant core `Skill` and a *non*-conformant input to
  the daemon's `unified-skills.register()`. The repository asset is not malformed; the daemon
  invented a second asset format. This is what makes lossless ingestion possible — and what would
  make any "make it fit" transformation a silent change of meaning.
- **Nine decisions** (`D-01`–`D-09`) requiring approval before implementation, each with a
  recommendation, an alternative, the trade-off, and the cost of postponing. One of them (`D-05`)
  exists because `defect-regression-tests.js` L135-141 currently pins 200-plus-`is_synthetic` for an
  unknown pack id: the HTTP contract is preserved and the honesty is moved to the tool boundary.
- **Deliverables.** Remediation plan, updated dependency map (§10), proposed TypeScript contracts
  (§11), migration strategy (§12, additive and reversible by directory copy), test and acceptance
  matrix (§13, `T-R1`–`T-R30`), decision register (§9), and the MVP sequence (§14).

Not claimed: no phase is implemented, tested or measured. The 8 stored Experiences cannot be
repaired — their retrieval key was never recorded, and deriving one now would be an invention.

### Added — QODER-02: context assembly forensic audit (findings only, no fixes)

The real Dynamic Context Pack delivered to Qoder (`dynamic-mvuwbms2`, pipeline_version 4.5.0) carried
`skills: []`, `knowledge: []`, `experiences: []` while listing `unified_skills`, `knowledge_store` and
`cbr_experiences` among `components_used`. A read-only audit now records why:
`docs/07-evaluation/experiments/QODER-02-context-assembly-forensics.md`.

- **`components_used` is a hard-coded literal** (`pipeline-integrator.js` L368-379, identical to
  `stats()` L616-634). It reports nothing measured, so it cannot contradict an empty channel — the
  label and the result were never connected. Any component-usage claim in an analyze response is
  unfalsifiable as shipped.
- **Four states collapse into one `[]`**: three `catch` blocks (L166-168 / L188-190 / L204-206) plus
  `listAll`/`list` returning `[]` on a failed `readdir` erase the distinction between store empty,
  store missing, unreadable, and assets present but scoring zero.
- **No project or repository identity exists anywhere.** Not in the knowledge record schema
  (`knowledge-store.js` L38-50), not in `cbr` records (`cbr.js` L51-58, no `run_id`/`task_type`/
  `domain`), not in `buildContextPack`'s inputs. `NEMONS_HOME`, resolved at module load, is the only
  isolation — so project-aware retrieval is impossible by construction, not merely absent.
- **Experience retrieval is dead as currently stored.** All 8 experiences in the installed home have
  `prompt: ""`; `sim()` returns 0 for an empty side and the 0.15 floor drops every candidate. Enabled
  by `nemons.store_experience` requiring nothing (`routes/mcp.js` L112, `additionalProperties:true`)
  and `evaluate_run` defaulting `prompt` to `""`. `harness.cbr_retrieval_strategy` (`filter_by`,
  weights) is declared and never consulted.
- **`run_id` is required and then dropped.** `evaluateRun` destructures it and never uses it; evidence
  is addressed by filename only and its body carries no id (11/11 records), and no experience carries
  a run. Experience ↔ Evidence ↔ Run cannot be joined in either direction.
- **`detectDomain` misroutes by substring.** Keywords are matched with `prompt.includes(kw)` and the
  first key wins (`persona-evolver.js` L175-193): `"ai"` inside `constrAInts` classified a documentation
  prompt as `machine-learning` and generated an "ML Pipeline Engineer" candidate. Reproduced verbatim
  in the report. The Use ≠ Adopt gate held, so it was recorded and not applied.
- **No documentation task category.** Six specialized harnesses plus base, first `\b` regex wins
  (`harness-router.js` L113-119), so a docs prompt routes to `FeatureHarness` on the word
  "implement". `documentation_added` stays in `should_pass` because `must_pass` maps to deterministic
  verifier checks (`CONSTRAINT_FLAGS`) and it has none; `augmented:false` and
  `router_persona_applied:false` are correct for domain `general`.
- **The dynamic pack id is not retrievable.** Minted at L337-338 from `Date.now()` base36 with no
  collision suffix (unlike `cbr.retain` L46-49, which added one for exactly this reason), never
  persisted; `getContextPack` reads only `<home>/context-packs/<id>.yml` and answers an unknown id
  with **HTTP 200 and a synthetic pack**. A host following `analyze_prompt` → `get_context_pack(
  suggested_pack_id)` is silently downgraded.
- **The curated asset tree never reaches runtime.** Installers copy only `daemon.yml` and
  `governance-rules.yml` (`install.sh` L45-47 and the per-OS scripts), so `skills/` (23),
  `personas/` (18), `knowledge/` (2) and `config/context-packs/` (1) have no install or seed path —
  and `skills/tdd.json` has no `status`/`domain`/`triggers`, the fields `register()` requires. On this
  machine `~/.nemons/config/daemon.yml` does not exist, so interception filters, evaluation criteria
  and redaction patterns are inert (`loadDaemonConfig` → `{}`). 16 skill candidates and 10 personas sit
  unadopted behind a promotion path (`approval-promotion.js`) that has never been exercised here.

Twelve findings are ranked in the report with exact loci. **Nothing was repaired in this task**: no
asset was adopted or installed, no store was written, and the audit is a diagnosis that leaves the
repair as a separate decision.

### Added — Qoder IDE as the real-host validation target

The integration-validation target moved from Codex CLI to **Qoder IDE 1.37.0**, the host
the developer actually uses. Codex's adapter and its 22 checks were left untouched.

- **`nemos/src/utils/qoder-host.js` — the Qoder registration driver.** Qoder exposes no MCP
  CLI at all (no `mcp add`, no `mcp list --json`, no `doctor`, no reload command), unlike
  Codex, so the driver reports two evidence levels and keeps them apart: `configReadback`
  ("saved", read back from disk) and `runtimeDiscovery` (read-only inspection of the
  IDE-written `SharedClientCache/**/mcps/<name>/` tool cache, which Nemons never writes).
  Merging into `~/.qoder/mcp.json` preserves every foreign server and unrelated field,
  keeps the detected indent, writes through a temp file + rename, and refuses outright —
  leaving bytes alone — when the file is present-but-unparsable or unreadable.
- **`nemos/src/commands/plugin.js` — host drivers and profiles.** `HOST_DRIVERS` /
  `HOST_PROFILES` replace the Codex-shaped assumptions baked into the install path:
  each host now states its own home label, entry label, evidence note and reload note,
  so `plugin list` says "read back from the file the IDE reads — not a live connection"
  for Qoder while Codex keeps "confirmed via codex mcp list --json". The old detection
  guessed a `qodercli` binary that does not exist; it now reads `product.json`
  (`Qoder IDE 1.37.0`, VS Code base 1.106.3, build 2026-10-26). `SOURCE_FILES.qoder`
  switched from the file-staging shim to `integration: "mcp", driver: "qoder"`.
- **Authentication was not weakened to make integration succeed.** Qoder documents no
  credential field for a remote MCP entry, so when the daemon demands a token the install
  **refuses** with an explanation instead of writing a plaintext secret into a file the IDE
  reads; a test asserts the token never reaches stdout, stderr or disk.
- **Fixed: `nemons plugin install` exited 0 while reporting `✗ Failed: 1`.** The CLI
  dispatch ignores module return values, so a fully failed install still looked green to
  CI. Install now sets `process.exitCode = 1` when nothing registered and something failed.
- **MCP provenance: `<NEMONS_HOME>/logs/mcp-access.log`.** One JSONL line per JSON-RPC
  message (`ts`, `duration_ms`, `source_ip`, `user_agent`, `method`, `request_id`, `tool`,
  `outcome`, `rpc_error_code`), never the request body, rotated at 1 MiB, warning once if
  unwritable. Without it, "the host invoked the tool" and "our test script invoked the
  tool" are indistinguishable after the fact.
- **Suite: `nemos/tests/host-integration-tests.js` 22 → 45 checks** (0 failed on a machine
  with both hosts; measured 35 passed / 3 skipped / exit 0 in a host-less environment, so CI
  reports skips instead of unearned passes). New Qoder gates: merge onto a foreign server
  without disturbing its secret, byte-for-byte refusal of a malformed config, refusal to
  replace an unreadable one, the discovery cache is never written by us, isolated-home CLI
  install that must not claim a connection, `plugin list` honesty, idempotent re-install and
  scoped remove, the auth refusal, the Qoder version gate (now skipping when no
  `product.json` is readable instead of failing a host it cannot see — a real defect found by
  running the suite host-less), and the two provenance gates for the access log.
  Daemon totals re-derived: **210 checks always-run, 220 with Codex CLI and Qoder IDE
  installed** (175 across the six in-process suites + 35 unconditional host checks + 10
  host-gated).
- **`docs/07-evaluation/experiments/QODER-01-host-capability-report.md`** — the host
capability report: verified host identity, the `userConfigMD5` proof that
`~/.qoder/mcp.json` is the file the runtime reads, the documented transport/timeout/
confirmation behaviour with sources, a Codex-vs-Qoder capability matrix, what was proven
live, and what was not.
- **`INSTALL.md`, `README.md`, `nemos/README.md`, `nemos/docs/architecture.md`** now describe
  the Qoder path, its captured install output, and the two host limits (no credential field,
  no reload command).

**Not claimed:** host-side tool discovery and model-driven invocation. The registration was
written into the developer's real `~/.qoder/mcp.json` with explicit approval and read back
byte-for-byte (`TestSprite` and its credential untouched, 328 → 426 bytes, indent preserved),
but the running IDE never sent a single `POST /mcp` — the derived registry still hashed the
pre-write file, no `nemons` entry appeared in the host tool cache, and the access log records
only our own probe. A reported UI state ("link icon, tools expandable") conflicted with that
record and is documented as unresolved rather than adopted. The strongest signal is the runtime
tool manifest of the conversation the registration was validated in:
`%APPDATA%\Qoder\SharedClientCache\projects\c--c-Nemons\mcps\` lists `browser-use`, `genui`,
`TestSprite` and no `nemons`, which is the directory the agent harness reads to expose the
MCP tools a conversation may call. Objectives 5–8 (real model-driven
invocation, Context Pack consumption, two-Run continuity through the host, Evidence-to-Run
association through host calls) therefore remain open, and no simulated substitute was built.

### Fixed — daemon defect pass (P0–P3)

- **Rate limiting could be bypassed by varying the id.** Buckets were keyed on
  `req.path` (the concrete URL), so `/candidate/<new-id>/can-use` opened a new
  bucket on every request: 70/70 passed while a repeated id stopped at 60. Buckets
  are now keyed on the route pattern + client id, and the map is swept.
- **Context packs were polluted by irrelevant history.** CBR retrieval had no
  relevance floor and the field named `similarity` reported a blended score, so a
  zero-overlap experience was injected into every pack at "similarity 0.3".
  Retrieval floors at 0.15 raw text similarity, `similarity` is the honest
  overlap, and the blended ranking value is `score`.
- **Every `/core/governed/*` route returned 500.** The routes passed an object to
  a positional core API and built a fresh `InMemoryCandidateStore` per request,
  so `propose` could never be followed by `approve`. They now share one engine,
  honour the documented contract, and map domain errors to 404/400, not 500.
- **Candidate state did not survive a restart.** The governed engine uses a
  file-backed store under `NEMONS_HOME/governed-candidates` (atomic writes; core's
  `InMemoryCandidateStore` remains the authority for validation and transitions),
  so proposals, decisions, and the review trail persist across processes.
- **Approving a skill never made it usable.** `/candidate/:id/approve` now
  promotes skill candidates into the unified skill store as `adopted`, and
  retrieval serves only `adopted` assets — machine-compiled skills enter as
  candidates and stay out of context packs until someone approves them.
- **`daemon start` reported success on a busy port.** A foreign listener could
  answer the health poll while the child had already died of `EADDRINUSE`, leaving
  a stale PID file. Start now pre-checks the port and polls child liveness,
  prints the error-log tail, and exits non-zero.
- **The end-to-end suite only passed by luck.** It used a fixed port and skipped
  teardown on failure; it now picks a free port and always stops the daemon and
  cleans up.
- **Writes were not atomic and ids could collide** in experiences, compiled
  skills, candidates, and subagents. All go through temp-file + rename now.
- **Post-run stages swallowed every error.** `post_run` reports `errors[]` per
  stage instead of silently dropping failed experience/skill/webhook steps.
- **Installers pointed at files that do not exist** (`install.ps1`, a wrong CLI
  path in `scripts/install.sh`); `NEMONS_HOME` also defaulted inconsistently
  between installer and runtime.
- **Config was partly decorative.** `verification.evaluation_criteria.must_pass`
  now selects the verifier's deterministic checks (`- tests_pass: false` opts out;
  unmappable names are reported in `constraints_ignored`), `should_pass` /
  `nice_to_have` reach context packs, and `interception.filters`,
  `experiences.retention.max_age_days`, `security.audit.retention_days` are read.

### Fixed — claims vs. code (honesty pass)

- **"Transparent interception" was not delivered, and the docs said it was.**
  Nothing here sits between an agent and the model: the daemon answers HTTP/MCP
  calls, and a host hook has to make them. README, INSTALL, the orchestrator
  skill, four docs pages, and every plugin manifest now say that, and the
  adapters under `plugins/` are marked `reference-shim` — they are not installed
  or exercised against any current host version. (Superseded for Codex by
  "Verified — real host integration" below; the six others still stand.)
- **Two plugin manifests pointed at files that did not exist.**
  `plugins/qoder/manifest.json` (`main`) and `plugins/trae/manifest.json`
  (`entry`) referenced a missing `nemons.js`, and `plugins/claude-code/plugin.json`
  referenced a missing `skills/nemons-orchestrator.md`. The two shims and the
  plugin-local skill copy now exist.
- **Approving a persona or a knowledge asset changed a status and nothing else.**
  Neither kind had an adoption destination, and real context packs had no
  `knowledge` section at all (the field existed only in the synthetic fallback).
  Both have stores now (`personas-evolved`, `knowledge-adopted`), approval
  promotes into them through one helper, and the pack builder reads adopted
  records only.
- **`/candidate/register` accepted any string as a type.** Six of the nine
  accepted kinds (`memory`, `experience`, `rule`, `tool`, `adapter`,
  `context_pack`) have no adoption destination, so approving one set
  `status: "adopted"` and nothing consumed it — the invariant held only where a
  store happened to exist. One table (`nemos/src/utils/asset-kinds.js`) now
  declares each kind's destination, registration refuses the kinds that can
  never be adopted (400 `unsupported_candidate_kind` with the reason and the
  supported list), `/core/governed/propose` reports `adoption.available`
  instead of refusing core's contract, and `/core/status` publishes the table.
- **The pack builder applied a persona it had just created as a candidate.**
  STEP 1 consumed a `status: "candidate"` dynamic persona on the same request
  that generated it — generation and adoption collapsed into one step. It now
  selects adopted personas, records new ones as `persona_candidate` with
  `used: false` for review, and falls back to the template persona otherwise.

### Fixed — fabricated outcomes (simulated runs)

- **Subagent outcomes were a coin flip.** `executeParallel` ran
  `const success = Math.random() > 0.2` and reported `completed` / `failed`
  accordingly, so `POST /subagent/orchestrate` returned invented successes with
  `result: "Completed: <task>"`, and `/subagent/orchestrator/stats` counted them.
  This daemon has no executor — running a subagent means calling the coding
  agent — so a spawn now yields a dispatch record (`status: "dispatched"`,
  `executed: false`, `result: null`), `execution: "delegated_to_host"`, and
  `merge_strategy: "not_executed"`. An `executor` can be injected
  (`new SubagentOrchestrator(mgr, { executor })`) to produce real, counted
  outcomes; nothing fabricates one any more.
- **Context packs carried no record of who was asked to run the subagents.**
  `results.orchestration` was computed and then dropped at pack assembly, so a
  caller could not tell that execution had been delegated to it. Packs now carry
  `orchestration` (`execution`, `spawned`, `dispatched`, `executed`, `succeeded`,
  `failed`, `retries`) and each subagent carries `status` / `executed`.
- **`mipro` and `aflow` scored variants with `0.5 + Math.random() * 0.5`.**
  `/evolution/run` returned that number as `expected_score` and picked a "best"
  variant from it. A label (`score_source: "random_unmeasured"`) is not enough:
  any consumer reading the number got a fabrication. Without an evaluator the
  variants are now returned unscored (`expected_score` absent, `scored: false`,
  `best_variant: null`) and an injected evaluator is the only way to get a score
  (`score_source: "external_evaluator"`).
- **Nine `/…/stats` endpoints answered `{}`.** `res.json(service.stats())` on
  an async method serialises a Promise, so `/evolution/stats`, `/rag/stats`,
  `/admit/stats`, `/ensemble/stats`, `/hcot/stats`, `/ntot/stats`,
  `/codevision/stats`, `/delegation/stats`, and `/scaffolding/stats` reported
  nothing while looking healthy. All await the call and map failures to 500.

### Fixed — bridge surface (TypeScript-core verification pass)

- **`POST /core/validate/candidate` rejected every body, valid records included.**
  The bridge called `requireCore().validateCandidate`; the core exports
  `validateCandidateRecord`. The `TypeError` was swallowed by the route's
  `catch`, which answers `400 {valid: false, error: "…is not a function"}` — a
  missing symbol reported as bad input. Two more wrappers had the same shape:
  `createPairedEvaluator` and `createOfflineSkillEvaluator` referenced the
  type-only interfaces `PairedEvaluator` / `OfflineSkillEvaluator`, which `tsc`
  erases, instead of the exported `Default*` classes. They had no callers, so no
  test could have caught them.
- **`/core/status` published an unverified API list, and CI checked only its
  length.** `available_apis` is a declared list, so it still read 18 while three
  entries were unreachable. It now also returns `unavailable_apis` (advertised
  names the bridge cannot resolve) and `bridge_integrity` (core symbols the
  bridge source dereferences but the loaded namespace does not export — derived
  by reading `nemos-bridge.js` itself, not a second hand-written list). The CI
  smoke test asserts both are empty, that the audit checked more than 30 symbols,
  and that a candidate the core itself proposed passes its own validator.
- **The dashboard advertised interception it does not perform.** The
  `intercepts_total` KPI is labelled "Intercepts — prompts captured" while the
  counter increments inside `/analyze`, i.e. only for prompts the caller
  volunteered. Renamed to "Packs served" with an explicit sub-line, the
  "Verification loop" panel is now "Context pack trial — POST /analyze" (it does
  not verify anything), and a prompt the filter skipped rendered red as a
  failure — it is the filter working and now has its own neutral state.
- **`Core APIs` counted a wildcard.** The KPI included `P2.*`, a group marker and
  not a callable, and reported "bridge loaded" regardless of whether the
  advertised surface resolved.
- **`/metrics` documented a shape it no longer returns.** The reference still
  showed `verification_pass_rate: 1.0` and omitted four of the seven fields; it
  now shows the real payload, and `evaluations_total` / `evaluations_passed` are
  published next to the historical `runs_total` alias so the key name no longer
  implies agent runs.

### Verified — TypeScript core and CI numbers

Measured in this pass rather than copied from documentation:

- `npx tsc --noEmit` → exit 0. `npm run build` → exit 0, and the committed
  `dist/` is byte-identical to a clean rebuild (`git diff --quiet -- nemos-core/dist`
  succeeded; the seven files that looked modified differed only in line endings,
  now pinned by `.gitattributes`).
- `npx vitest run` → **70 test files, 1221 tests, 0 failed, exit 0 on Windows**.
  The Stage C suite had been failing there because it shelled out to
  `scripts/stage-c/setup-fixture.sh` and the path arrived mangled; the fixture is
  now built in-process (`tests/stage-c/fixture.ts`) with `execFile` argv, so no
  shell parses a path.
- Per-directory test counts were re-derived with `--reporter=json` and replace a
  stage-based breakdown in `nemos-core/README.md` that summed to 1215, not 1221.
- Corrected claims that had no file behind them: `docs/reports/` does not exist
  (the 8 stage reports live in `docs/`, Stage B–I), `docs/adr/` holds 16 ADRs in
  17 files, `src/schemas/` has 11 schema modules and 10 validators rather than
  "9 domain schemas", and the arXiv citations are in daemon module headers — they
  are not re-verified here, so "10 verified arXiv papers" is gone.
- Daemon suites: unit 35, persona 33, bridge 22, security 21, MCP 26, regression
  34 → **171 checks**, plus the 11-step end-to-end run (as measured then: the CLI dispatch
  section below adds four regression tests, so those six suites are 175 today).

### Verified — real host integration (Codex CLI 0.149.1)

The honesty pass marked every adapter a reference shim. That was true then; it is no
longer true for Codex, which is now installed against a real host and confirmed by the
host itself. Measured against `codex-cli 0.149.1` on Windows, not inferred:

- **`plugins/codex/` was never a Codex feature.** The old installer copied files to
  `~/.codex/plugins/nemons/`, printed `✓ Plugin installed for Codex CLI`, and
  `plugin list` confirmed it with `✓ installed (at …)`. `~/.codex` has no `plugins`
  directory — 0.149.1 reads `[mcp_servers]` from `config.toml`,
  `skills/<name>/SKILL.md`, and `AGENTS.md`. The install had no effect on the host.
- **`nemons plugin install --agent codex` now registers through the host and reads the
  host back.** `codex mcp add` → `codex mcp list --json` → `codex doctor`'s own
  `mcp.config` check, which answers `ok / "MCP configuration is locally consistent"`.
  No exit code is treated as proof: a zero-status `add` whose read-back does not match
  the expected URL is reported as a failure. `plugin remove` is confirmed the same way,
  and `plugin list` distinguishes `✓ registered` / `⚠ registered elsewhere` (stale
  URL) / `✗ not registered`. Without the CLI, a `config.toml` merge is the fallback —
  and that fallback was checked by hand-writing a block and watching the real host load
  it.
- **The bearer var is wired only when the daemon demands one.** Registering a
  `bearer_token_env_var` the environment does not resolve makes `codex doctor` report
  `warning / "MCP configuration has optional issues"` forever — with the misleading
  remediation "Set the missing MCP env vars". Install now asks the running daemon
  (`/health.auth_enabled`) and omits the var when auth is off. The suite asserts both
  directions, including a token-protected daemon producing `auth_status:
  "bearer_token"`.
- **Two host behaviours that only measurement revealed.** `codex mcp add` aborts with
  "CODEX_HOME points to …, but that path does not exist" when the home is missing (so
  the driver creates it first), and `auth_status` is computed by probing the endpoint —
  which means a `spawnSync` caller cannot host the daemon in the same process, because
  the blocked event loop makes the host report `unknown`. The suite runs the daemon in
  its own process for exactly that reason.
- **A documentation defect that would have shipped into a host:** the orchestrator
  skill told the model `GET /analyze`; the route is `POST` (verified against
  `server.js`). Fixed in `config/skills/nemons-orchestrator.md`, and the installed copy
  — never the repo file — has its daemon URL re-pointed at the resolved port, with the
  rewrite count printed.
- **The other six adapters are now labelled what they are.** `plugins/*/` installs
  report `~ Files staged … the host was not asked to confirm them` with a counter
  separate from host-confirmed registrations, instead of `✓ Plugin installed`.
- Deliberately **not** claimed: that Codex loads the installed skill (write and re-read
  only — discovery is the host's decision), and that a model turn ran with Nemons' tools
  in it (needs provider credentials; `codex doctor` reports `auth.credentials: fail`
  here). README, `nemos/README.md`, `nemos/docs/architecture.md`,
  `nemos/docs/plugin-development.md` and `INSTALL.md` now state the split.
- Suite: `nemos/tests/host-integration-tests.js` — **22 checks, exit 0** on a machine
  with the CLI. **13 run everywhere** (TOML merge, MCP-over-the-registered-URL, auth
  detection, token-protected daemon); 9 are gated on a real `codex` binary and
  self-skip without it. Wired into CI (`test-daemon`) and `npm run test:host`, so the
  daemon total is 171 → **188 always-run checks, 197 with Codex installed** (38 in the
  regression suite — see the CLI dispatch section below).

### Fixed — CLI dispatch (found by running the documented commands)

Installing against the real host meant typing the commands the docs tell you to type.
Four of them did not work.

- **`nemons health` and `nemons install` threw before doing anything.** The CLI
  dispatches `cmd(subcommand, flags)`; both modules declared a single parameter, so
  `opts` was the subcommand — `undefined` for a flag-less call — and `opts.url` died on
  "Cannot read properties of undefined". The root `npm run health` was broken the same
  way. Both now take `(subcommand, opts)`.
- **A leading flag was parsed as the subcommand.** `nemons health --detailed` handed the
  command module the string `"--detailed"` and never put it in `flags`, so the detailed
  branch was unreachable from the CLI. `bin/nemons.js` now treats an `args[1]` that
  starts with `-` as an option and parses from there. Verified live: `health --detailed`
  prints `Home:`/`Timestamp:` and `health` against a dead port exits 1 naming the right
  URL.
- **`nemons intercept enable|disable` claimed it notified the daemon.** It fetched
  `/health` on a hardcoded `:3456` and printed "✓ Daemon notified (config will reload on
  next request)". There is no reload channel — `server.js` calls `loadDaemonConfig()`
  once at startup — so nothing had been notified and the change was not live. It now
  reports the resolved port, says a `nemons daemon restart` is required (or that the
  file applies at next start), and drops "Subsequent prompts will go directly to the
  agent", which implied a path through Nemons that does not exist. The wording also
  calls it what it is: prompt-screening config.
- **Two CLI entry points had diverged.** `bin/nemos.js` (called by the root
  start/stop/health/verify scripts and the platform launchers) kept its own copy of the
  argument parser and missed the "a bare flag followed by another flag is boolean"
  fix, so `--no-doctor --port 3456` silently dropped `--port` there. It now delegates to
  `bin/nemons.js`, the file `package.json` publishes as `nemons`; the behaviour is
  identical for every documented call (`--version`, `--help`, `daemon start/stop`,
  `health` re-verified through the legacy path).
- **The installer's "Next steps" printed `tail -f ~/.nemons/logs/daemon.log`** while
  `NEMONS_HOME` relocates the whole store; it now prints the resolved log path.
- Four regression tests in `tests/defect-regression-tests.js` ("CLI dispatch (arity and
  flag parsing)") pin all of the above, including an assertion that the fabricated
  reload notice stays dead: regression 34 → **38**, daemon totals **175** in the six
  original suites and **188 / 197** with the host suite.

### Added

- `nemos/src/utils/codex-host.js` — the Codex host driver: `detectCodex`,
  `codexHome`, `registerMcpServer` (CLI first, `config.toml` merge fallback, read-back
  gate), `verifyRegistration`, `listMcpServers`, `removeMcpServer`, `installSkill` /
  `skillInstalled` / `removeSkill`, `hostDiagnosis` (`codex doctor --json`),
  `daemonAuthEnabled`. Every success claim comes from the host's own view.
- `nemos/tests/host-integration-tests.js` — 22 checks (13 unconditional, 9 gated on a
  real `codex` CLI), `npm run test:host`, and a CI step in `test-daemon`.
- `nemons plugin install|list|remove --agent codex` accepts `--home <CODEX_HOME>`,
  `--port <daemon port>` and `--no-doctor`.
- `nemos/src/daemon/approval-promotion.js` — the single place that knows which
  store consumes an approved candidate of each kind (`skill`, `persona`,
  `knowledge`); used by both `/candidate/:id/approve` and
  `/core/governed/approve`. Non-promotable kinds report `kind_has_no_adoption_store`
  instead of a bare "approved".
- `nemos/src/utils/knowledge-store.js` — adopted-knowledge store (`adopt`, `list`,
  `retrieve`, `stats`); retrieval returns nothing without keyword overlap, so
  existing knowledge is never injected "because it exists".
- `nemos/src/utils/asset-kinds.js` — candidate kind → adoption destination table
  (`live` / `no_destination` / `not_promotable`, each with a reason), used by
  registration, approval promotion, the invariant enforcer, and `/core/status`.
- `nemos/src/utils/governed-candidate-store.js` — file-backed `CandidateStore`
  that extends core's in-memory store (no duplicated state machine).
- `nemos/src/daemon/rate-limit.js` — route-pattern limiter installer.
- `nemos/src/utils/ids.js` — collision-free id helper (`timeId`).
- `nemos/tests/defect-regression-tests.js` — 32 regression tests, one per shipped
  defect, wired into `test:all`, root `test:daemon`, and both CI jobs.
- `GET /core/status` reports `governed_store`; `GET /health` reports
  `auth_enabled` (auth is still opt-in via `NEMONS_AUTH_TOKEN`);
  context packs synthesized for an unknown id are labelled `is_synthetic`.

## [4.5.0] - 2026-10-27

### Added — MCP server (Model Context Protocol) at `/mcp`

- The daemon now speaks MCP natively: **Streamable HTTP, stateless mode**,
  JSON-RPC 2.0, **zero new dependencies** (a deliberate spec subset —
  initialize / ping / tools/list / tools/call — hand-rolled to keep the
  daemon dependency-light). Protocol-version negotiation supports
  **2025-11-25** and **2025-06-18**; batching (removed from the spec) is
  rejected with `-32600`; parse failures return the spec-correct
  `-32700`/HTTP 400.
- **Seven tools**, matching the manifest declared in claude-code's plugin:
  analyze_prompt, get_context_pack, collect_evidence, evaluate_run,
  store_experience, retrieve_similar_experiences, health_check — each with
  a JSON-Schema `inputSchema` validated at the boundary (types, patterns,
  required).
- Spec-correct error taxonomy: tool-level failures (invalid ids, traversal
  payloads) surface as `isError` RESULTS; protocol-level problems surface
  as JSON-RPC errors (-32601/-32602/-32603). Auth and rate limiting apply
  to `/mcp` automatically (shared middleware).
- This closes the Task 24 audit finding for real: the MCP surface declared
  by the claude-code plugin now exists, and the manifest flips to
  `status: "live"` (type http / streamable-http, no more remote+stdio
  contradiction).

### Changed — one core loop, two transports

- `src/daemon/core-loop.js` (new): the product loop (analyze → evidence →
  evaluate → experiences → context-pack) exists ONCE. The HTTP routes are
  thin wrappers over it and the MCP tools call the same functions —
  the two transports can never drift (same filters, guards, counters,
  response shapes).

### Added — MCP conformance suite

- `tests/mcp-tests.js` (26 tests): handshake + version-negotiation matrix,
  notification → 202, tools shape, round-trips for every tool,
  isError-vs-protocol-error taxonomy, transport 405s, auth coverage, and
  rate-limit tripping on `/mcp`.

## [4.4.0] - 2026-10-26

### Added — professional dashboard redesign

- The daemon dashboard (`/`, `/dashboard`, `/ui`) was rebuilt from scratch
  in the dark developer-console design language (quiet surfaces, one accent,
  tabular numerals, 11px letter-spaced labels): pulsing health indicator,
  six live KPI cards (evaluations + pass rate, experiences, evidence,
  intercepts, memory, core APIs), a verification-loop tester with verdict
  pills and JSON output, a recent-experiences feed, system and docs panels,
  and a 5s auto-refresh. Still one self-contained HTML file with **zero
  external assets** — no CDNs, no fonts, no frameworks. All dynamic
  rendering remains textContent-only (stored-XSS safe). Verified live in a
  browser: KPIs update in real time and the analyzer returns an intercepted
  verdict with the full context pack.

### Added — first plugin audit (all 7 plugins, empirical)

- Audited against a live daemon: the JS/TS plugins' core-loop calls
  (analyze/context-pack/evidence/evaluate/experiences) and claude-code's
  session hooks all return 200.
- **Finding**: claude-code's manifest declared an MCP server at `/mcp`
  with 7 tools — the daemon implements NO MCP endpoint (404), and the
  manifest transport was contradictory (remote + stdio). The manifest now
  honestly marks the MCP surface `planned` with `auto_invoke: false`;
  implementing a spec-correct MCP endpoint is a tracked future feature.

### Added — StrykerJS mutation-testing baseline

- `stryker.conf.json` committed (scoped, `coverageAnalysis: perTest`);
  first run on `paired-evaluator.ts`: **mutation score 63.12%**
  (89 killed / 48 survived / 141 mutants). The honest test-strength
  baseline — raising it is now measurable work via `npx stryker run`.

### Changed — documentation

- WORKLOG Task 24: the full P0–P3 record, release mechanics, both live CI
  incidents with their lessons, the plugin audit, and the fresh-user
  validation.
- INSTALL.md: `daemon stop` requires the same `NEMONS_HOME` the daemon was
  started with (non-default homes).

## [4.3.0] - 2026-10-24

The P0–P3 hardening cycle: security fixes, daemon restructure,
core durability, and honest surface documentation. All 1343 checks
green locally and in CI.

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

**P2 — core polish (@nemons/core)**

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

**P1 — daemon restructure**

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

**P0 — security & correctness hardening**

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
