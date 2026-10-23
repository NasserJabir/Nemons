# Nemons Architecture

## Overview

Nemons is a transparent orchestration layer that sits between you and your coding agent (OpenCode, Claude Code, Codex, etc.). It auto-triggers on every prompt to:

1. Inject the right Context Pack
2. Collect Evidence after the agent responds
3. Run the Verification Loop
4. Store successful runs as Experiences for future reuse

```
┌──────────────────────────────────────────────────────────────┐
│  YOU                                                         │
│  ↓ prompt                                                    │
├──────────────────────────────────────────────────────────────┤
│  CODING AGENT (OpenCode, Claude Code, Codex, etc.)          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Nemons Plugin (transparent, auto-trigger)           │   │
│  │  - Intercepts prompt                                │   │
│  │  - Calls Nemons daemon                              │   │
│  │  - Injects Context Pack                             │   │
│  └────────────────────────┬─────────────────────────────┘   │
└───────────────────────────┼──────────────────────────────────┘
                            │ HTTP (localhost:3456)
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

### 5. Plugins (per coding agent)
- **OpenCode**: `plugins/opencode/nemons.ts` (TypeScript)
- **Claude Code**: `plugins/claude-code/plugin.json` (manifest)

## Data Flow on Every Prompt

```
1. User types: "implement a hello world function"
2. Plugin intercepts (in coding agent)
3. POST /analyze { prompt, project_root, adapter }
   → Returns: { should_intercept: true, suggested_pack_id, similar_experiences }
4. GET /context-pack/{pack_id}
   → Returns: { persona, skills, knowledge, success_criteria }
5. Plugin injects Context Pack as system context
6. Coding agent processes prompt with augmented context
7. Plugin collects Evidence (diff, tests, lint)
8. POST /evidence { run_id, evidence }
   → Secret redaction applied automatically
9. POST /evaluate { run_id, evidence }
   → Returns: { passed: bool, level, failures, experience_stored }
10. If passed → Experience stored for future reuse
    If failed → Retry (max 2) with enriched context
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
