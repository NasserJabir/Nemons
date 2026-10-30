# @nemons/cli — Nemos Daemon (JS)

This is the daemon you actually run. It is the bridge between your coding
agent (OpenCode, Claude Code, Codex, Kimi, Cline, Qoder, Trae) and the
TypeScript `@nemons/core` package.

Only the HTTP and MCP surfaces are fully tested, plus two host integrations driven
by real hosts: the Codex CLI adapter, verified against codex-cli 0.149.1, and the
Qoder IDE adapter, registered against Qoder IDE 1.37.0 — where the registration and
read-back are proven but the host never connected during validation, so discovery and
model invocation remain unverified. Both are covered by
`tests/host-integration-tests.js`. The other per-host adapters in `../plugins/`
are reference shims — see "Integration status" in the root README before assuming
a host is supported.

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
# → { "status":"healthy", "version":"4.5.0", "core_loaded":true, ... }
```

## How it relates to `../nemos-core/`

The daemon is **CommonJS** (loadable by the reference shims; the Codex host path
is verified, the others are not certified). The core is **ESM** (clean TypeScript).
They communicate through the
bridge shim at `src/utils/nemos-bridge.js`, which:

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

`../plugins/` holds 7 per-host adapters. Six are **reference shims** — files staged in
a plausible directory, never accepted by a host:
- `opencode/nemons.ts`
- `claude-code/plugin.json`
- `kimi/nemos.js`
- `cline/nemos.js`
- `qoder/manifest.json`
- `trae/manifest.json`

Codex is the exception. Codex has no plugin directory, so `codex/nemos.js` is only a
sketch of the hook shape; what installs is **`src/utils/codex-host.js`**, which runs
`codex mcp add`, writes the skill to `$CODEX_HOME/skills/`, and reads the host's own
view back (`codex mcp list --json`, `codex doctor`) before reporting anything —
verified against codex-cli 0.149.1. See "Integration status" in `../README.md`.

Install scripts for each platform are in `../scripts/` and at the repo root
(`install.sh`, `install.bat`, `start.sh`, `start.bat`, `stop.sh`, `stop.bat`).

## Tests

```bash
npm test                # → tests/run-all.js (end-to-end daemon lifecycle, 11/11)
npm run test:unit       # → tests/unit-tests.js (35/35)
npm run test:v421       # → v421-persona-tests.js (33/33) + v421-bridge-tests.js (22/22)
npm run test:security   # → tests/security-tests.js (21/21)
npm run test:mcp        # → tests/mcp-tests.js (26/26)
npm run test:regression # → tests/defect-regression-tests.js (38/38)
npm run test:host       # → tests/host-integration-tests.js (35 unconditional, 45 with both hosts)
npm run test:all        # every suite above except the end-to-end run
```

**210 checks across the seven suites (220 when both the Codex CLI and Qoder IDE are
installed), plus an 11-step end-to-end run** — all green, measured on Windows. CI runs
the same suites on a Linux/macOS matrix, a Windows job for the six in-process suites, and
a daemon smoke test (`test:regression` is not in the smoke path). On CI runners the
host-gated checks self-skip, so a green host run there reports 35 passed / 3 skipped,
not 45 — measured in a host-less environment on this machine.
`test:regression` is not optional: every test in it
encodes a defect that shipped, so a failure there means the defect is back.

The TypeScript core has its own suite (`cd ../nemos-core && npm test`); CI is the
authoritative count — numbers copied into documentation go stale.

## Documentation

- `docs/api-reference.md` — full REST API reference
- `docs/architecture.md` — system overview
- `docs/plugin-development.md` — how to write a plugin
- `docs/architectural-principles.md` — the 14 invariants
- `../CHANGELOG.md` — release history
- `../WORKLOG.md` — task log across the project's task IDs

## License

MIT — see `../LICENSE`.
