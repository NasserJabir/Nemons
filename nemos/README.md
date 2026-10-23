# @nemons/cli — Nemos Daemon (JS)

This is the daemon you actually run. It is the bridge between your coding
agent (OpenCode, Claude Code, Codex, Kimi, Cline, Qoder, Trae) and the
TypeScript `@nemons/core` package.

## Quick start

```bash
# 1. Install dependencies
cd nemos/
npm install

# 2. Start the daemon
npm start
# → Daemon listening on http://127.0.0.1:3456

# 3. Verify health
curl http://127.0.0.1:3456/health
# → { "status":"healthy", "version":"4.2.1", "core_loaded":true, ... }
```

## How it relates to `../nemos-core/`

The daemon is **CommonJS** (works with all 7 coding agent plugins). The core
is **ESM** (clean TypeScript). They communicate through the bridge shim
at `src/utils/nemos-bridge.js`, which:

1. At daemon startup, dynamic-imports `../nemos-core/dist/index.js`
2. Caches the namespace so all bridge calls are synchronous thereafter
3. If dist/ is missing, `/core/*` endpoints return 503 with an actionable hint
4. `/health` reports `core_loaded` so you can verify the bridge is wired

## Endpoints

- **Daemon-only**: `/analyze`, `/context-pack/:id`, `/evidence`, `/evaluate`,
  `/experiences`, `/sessions/*`, `/trust/*`, `/cbr/*`, `/verify`, `/redact`,
  `/dag/plan`, `/iir/validate`, `/skills/*`, `/memory/*`, `/provenance/*`,
  `/approvals/*`, `/analyze/static`, `/secrets/detect`, `/plugins/*`,
  `/ttsi/run`, `/benchmark/*`, `/unified-skills/*`, `/pipeline/*`,
  `/identity/*`, `/candidate/*`, `/state/*`, `/tools/*`, `/tool-providers/*`,
  `/adapters/*`, `/environments/*`, `/golden-tasks/*`, `/metrics/*`,
  `/rate-limit/*`, `/webhooks/*`, `/openapi`, `/api-docs`, `/enforcer/*`,
  `/persona/evolver/*`, `/subagent/*`, `/skill-evolver/*`

- **Bridge (TS core)**: `/core/status`, `/core/governed/{propose,
  request-review, approve, supersede, rollback}`, `/core/validate/{persona,
  skill, run, evidence, experience, candidate, context-pack}`,
  `/core/action/check`, `/core/regression/detect`, `/core/ablation/run`,
  `/core/budget/check`, `/core/permission/check`, `/core/context/optimize`,
  `/core/reconstruct`, `/core/lineage/build`, `/core/assets/{export,import}`,
  `/core/dev/inspect/:runId`, `/core/id/:kind`, `/core/sha256`

- **Dashboards**: `/` (main dashboard), `/dashboard`, `/ui`, `/health`,
  `/metrics`

## Plugins

The daemon ships with 7 coding agent plugins (see `../plugins/`):
- `opencode/nemons.ts`
- `claude-code/plugin.json`
- `codex/nemos.js`
- `kimi/nemos.js`
- `cline/nemos.js`
- `qoder/manifest.json`
- `trae/manifest.json`

Install scripts for each platform are in `../scripts/` and at the repo root
(`install.sh`, `install.bat`, `start.sh`, `start.bat`, `stop.sh`, `stop.bat`).

## Tests

```bash
npm test          # → tests/run-all.js (legacy E2E)
npm run test:unit # → tests/unit-tests.js (33/35 — 2 pre-existing HCoT/IIR)
npm run test:v421 # → tests/v421-persona-tests.js (33/33) +
                  #   tests/v421-bridge-tests.js (22/22)
```

Total: **88/90 passing** in the JS daemon + **1215/1215** in the TS core.

## Documentation

- `docs/api-reference.md` — full REST API reference
- `docs/architecture.md` — system overview
- `docs/plugin-development.md` — how to write a plugin
- `docs/architectural-principles.md` — the 14 invariants
- `../CHANGELOG.md` — release history
- `../WORKLOG.md` — 1808-line task log across 23 task IDs

## License

MIT — see `../LICENSE`.
