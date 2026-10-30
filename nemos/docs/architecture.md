# Nemons Architecture

## Overview

Nemons is a governed context/evidence service that a coding agent calls over HTTP or MCP. It is **not** in the agent's inference path and intercepts nothing by itself: a host adapter (or a skill the model follows) makes the calls. When it is called, it:

1. Builds a Context Pack from adopted assets only
2. Collects Evidence after the agent responds
3. Runs the Verification Loop
4. Stores successful runs as Experiences for future reuse

```
┌──────────────────────────────────────────────────────────────┐
│  YOU                                                         │
│  ↓ prompt                                                    │
├──────────────────────────────────────────────────────────────┤
│  CODING AGENT (OpenCode, Claude Code, Codex, etc.)          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Codex: MCP server registered by the host             │   │
│  │ Others: reference shim (hook or skill), unverified   │   │
│  │  - Sees the prompt, if the host exposes a hook      │   │
│  │  - Calls the Nemons daemon                          │   │
│  │  - Adds the Context Pack to what it sends           │   │
│  └────────────────────────┬─────────────────────────────┘   │
└───────────────────────────┼──────────────────────────────────┘
                            │ HTTP (localhost:3456) + /mcp
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  NEMONS DAEMON (Express server)                              │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────────────┐   │
│  │ Policy      │ │ Context Pack │ │ Evidence Collector   │   │
│  │ Engine      │ │ Builder      │ │                      │   │
│  └─────────────┘ └──────────────┘ └─────────────────────┘   │
│  ┌────────────────────────────┐ ┌────────────────────────┐  │
│  │ Verification Loop          │ │ Experience Store        │  │
│  │ Controller                 │ │                         │  │
│  └────────────────────────────┘ └────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Daemon (Express server)
- **File**: `nemons/src/daemon/server.js`
- **Port**: 3456 (default)
- **Endpoints**: REST API on `/health`, `/analyze`, `/context-pack/:id`, `/evidence`, `/evaluate`, `/experiences`, `/metrics`, `/governance/rules`

### 2. CLI
- **File**: `nemons/bin/nemons.js`
- **Commands**: `daemon`, `health`, `plugin`, `intercept`, `verify`, `install`, `experiences`

### 3. Storage Layer
- **File**: `nemons/src/store/storage.js`
- **Location**: `~/.nemons/`
- **Subdirs**: `config/`, `context-packs/`, `experiences/`, `evidence/`, `logs/`, `audit/`

### 4. Utilities
- **filters.js** — Smart prompt interception logic
- **redaction.js** — Secret stripping (API keys, Bearer tokens, etc.)

### 5. Adapters (per coding agent)

**Codex CLI is the verified integration.** `nemos plugin install --agent codex`
does not copy files into a directory and hope: it calls `codex mcp add`, then reads
the host's own view back (`codex mcp list --json`, `codex doctor`'s `mcp.config`
check) and refuses to report success unless the read-back matches. Driver:
`nemos/src/utils/codex-host.js`; evidence: `nemos/tests/host-integration-tests.js`.
Codex has no plugin directory, so what gets installed is an MCP server registration
plus `$CODEX_HOME/skills/nemons-orchestrator/SKILL.md` — not `plugins/codex/nemons.js`,
which only documents the hook shape.

**Qoder IDE is registered against the real host, at a lower level of proof than Codex,**
because the host offers less to verify against. Qoder has no MCP CLI — no `mcp add`, no
`mcp list --json`, no `doctor`, no reload command. Its documented user surface is the file
`~/.qoder/mcp.json`, and the evidence that this is the file the runtime reads is the IDE's
own derived registry, which stores that file's MD5. `nemos plugin install --agent qoder`
merges `mcpServers.nemons` into it — never replacing the file, refusing a malformed one,
and refusing to write a bearer token because Qoder documents no credential field — then
reads the entry back from disk. Host discovery is reported as a *separate* state, from a
read-only look at `SharedClientCache/**/mcps/<name>/` (which Nemons never writes). Driver:
`nemos/src/utils/qoder-host.js`; evidence, capability matrix and the unverified parts:
`docs/07-evaluation/experiments/QODER-01-host-capability-report.md`. In this validation the
IDE never connected, so no tool reached a model and no model invoked one.

Every other adapter is a **reference shim**: files are copied to a plausible directory
and reported as `~ files staged`. No host was asked to accept them, and they have not
been exercised against current host versions.

- **Codex CLI**: `nemos/src/utils/codex-host.js` (registration driver) — verified
- **Qoder IDE**: `nemos/src/utils/qoder-host.js` (registration driver) — registered against the real host, host-side discovery not observed
- **OpenCode**: `plugins/opencode/nemons.ts` (TypeScript) — shim
- **Claude Code**: `plugins/claude-code/plugin.json` (manifest + skill) — shim
- **Trae / Cline / Kimi**: manifest + `nemons.js` shim each (Qoder's `plugins/qoder/` pair is the same kind of shim and is *not* what gets installed)

## Data Flow When a Host Adapter Calls In

```
1. User types: "implement a hello world function"
2. Adapter forwards the prompt (only if the host exposes a hook)
3. POST /analyze { prompt, project_root, adapter }
   → Returns: { should_intercept, context_pack, suggested_pack_id }
4. GET /context-pack/{pack_id} — only if the on-disk pack is wanted
   → Returns: { persona, skills, knowledge, success_criteria }
   (skills/knowledge/personas appear only once adopted)
5. Adapter adds the Context Pack to the prompt it sends
6. Coding agent processes prompt with augmented context
7. Adapter collects Evidence (diff, tests, lint)
8. POST /evidence { run_id, evidence }
   → Secret redaction applied automatically
9. POST /evaluate { run_id, evidence }
   → Returns: { pass: bool, layers, failures, post_run }
10. If pass → Experience stored, and a skill is compiled as a CANDIDATE
    (usable only after approval). Retrying is the caller's decision — the
    daemon reports the failure, it does not loop on its own.
```

## Security Architecture

- **Sandbox**: daemon binds to 127.0.0.1 only (no remote access)
- **Auth**: optional bearer token (`NEMONS_AUTH_TOKEN` env var)
- **Redaction**: automatic secret stripping before storage
- **Audit**: all runs and approvals logged with hash chain
- **RBAC**: tool-level permissions (planned)

## Configuration

Config file: `~/.nemons/config/daemon.yml`

Key sections:
- `interception` — filters, skip/intercept patterns, targets
- `context_packs` — auto-select strategy, cache TTL
- `evidence` — what to collect, what to skip
- `verification` — must/should/nice-to-have criteria, retry policy
- `experiences` — retention, cleanup, categorization
- `security` — sandbox, redaction, audit
- `governance` — approval rules (low/medium/high impact)
- `monitoring` — metrics, alerting, dashboard
