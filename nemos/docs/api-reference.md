# Nemons API Reference

Base URL: `http://127.0.0.1:3456`

## Endpoints

### `GET /health`
Returns daemon health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 12.5,
  "timestamp": "2026-10-22T08:46:48.308Z",
  "config_loaded": true,
  "home": "/home/user/.nemons"
}
```

### `GET /metrics`
Returns daemon counters, incremented at the event sites that actually happened.

**Response:**
```json
{
  "runs_total": 0,
  "evaluations_total": 0,
  "evaluations_passed": 0,
  "experiences_total": 5,
  "verification_pass_rate": null,
  "intercepts_total": 12,
  "evidence_stored_total": 3,
  "daemon_memory_mb": 69,
  "daemon_uptime_seconds": 12.5
}
```

`runs_total` and `evaluations_total` are the same counter — verification rounds,
not agent runs. `verification_pass_rate` is `null` until at least one evaluation
has run (a fresh daemon reports no data, not a 1.0 pass rate), and a ratio
(`0.67`) rather than a percentage when it does. `intercepts_total` counts
`/analyze` requests the filter decided to build a pack for — it is not a count of
captured agent traffic, because nothing here observes traffic it was not given.

### `POST /analyze`
Analyzes a prompt to decide if Nemons should intercept.

**Request:**
```json
{
  "prompt": "implement a hello world function",
  "project_root": "/path/to/project",
  "adapter": "opencode"
}
```

**Response (intercept):**
```json
{
  "should_intercept": true,
  "reason": "intercept_pattern_matched",
  "pattern": "build|implement|add|create|make",
  "suggested_pack_id": "dynamic-m1x2y3",
  "context_pack": {
    "id": "dynamic-m1x2y3",
    "persona_source": "template",
    "persona": { "role": "senior_engineer", "domain": "general" },
    "skills": [],
    "knowledge": [],
    "experiences": [],
    "subagents": [
      { "id": "sub-a1", "role": "executor", "status": "dispatched", "executed": false }
    ],
    "orchestration": {
      "execution": "delegated_to_host",
      "spawned": 2,
      "dispatched": 2,
      "executed": 0,
      "succeeded": 0,
      "failed": 0
    },
    "success_criteria": ["tests_pass", "no_syntax_errors"]
  }
}
```

A prompt that decomposes into more than two DAG nodes gets subagents. They are
**dispatched, not executed**: this daemon has no executor, so `executed` and
`succeeded` are `0` and each subagent carries `status: "dispatched"`. Running
them is the calling agent's job. `orchestration` is absent for small DAGs.

**Response (skip):**
```json
{
  "should_intercept": false,
  "reason": "prompt_too_short"
}
```

### `GET /context-pack/:id`
Returns a context pack by ID.

**Response:**
```json
{
  "id": "auth-feature",
  "persona": {
    "role": "Senior Auth Engineer",
    "constraints": ["OAuth 2.1 required"]
  },
  "skills": [
    { "id": "jwt-validation", "reference": "skills/jwt.md" }
  ],
  "knowledge": [
    { "id": "idempotency-rule", "title": "We use idempotency keys", "score": 2 }
  ],
  "success_criteria": ["tests pass", "no secrets in diff"]
}
```

A pack returned for an id that does not exist on disk is the synthetic default:
it carries `is_synthetic: true` and `source: "synthetic_fallback"`, and its
knowledge entry carries `source: "synthetic_fallback"` too.

### `POST /evidence`
Stores evidence for a run (with automatic redaction).

**Request:**
```json
{
  "run_id": "run-abc123",
  "evidence": {
    "diff": "...",
    "test_results": { "passed": true, "count": 5 },
    "lint_results": { "errors": 0 }
  }
}
```

**Response:**
```json
{
  "stored": true,
  "run_id": "run-abc123",
  "redacted": true
}
```

### `POST /evaluate`
Runs the verification loop on collected evidence.

**Request:**
```json
{
  "run_id": "run-abc123",
  "evidence": {
    "tests_pass": true,
    "no_syntax_errors": true
  }
}
```

**Response (passed):**
```json
{
  "passed": true,
  "level": "must",
  "failures": [],
  "experience_stored": "exp-xyz789"
}
```

**Response (failed):**
```json
{
  "passed": false,
  "level": "must",
  "failures": [
    { "check": "tests_pass", "expected": true, "actual": false }
  ],
  "experience_stored": null
}
```

### `GET /experiences`
Lists stored experiences.

**Query params:** `limit` (default 10)

**Response:**
```json
{
  "total": 5,
  "experiences": [
    {
      "id": "exp-abc123",
      "timestamp": "2026-10-22T08:46:48.308Z",
      "prompt": "...",
      "evidence": { ... }
    }
  ]
}
```

### `POST /experiences`
Manually store a new experience.

**Request:**
```json
{
  "prompt": "...",
  "evidence": { ... },
  "adapter": "opencode",
  "derived_skills": ["skill-1"]
}
```

**Response:**
```json
{
  "stored": true,
  "id": "exp-xyz789"
}
```

### `GET /governance/rules`
Returns loaded governance rules.

**Response:**
```json
{
  "change_categories": [
    { "id": "low", "auto_approve": true, ... },
    { "id": "medium", "requires_approval": 1, ... },
    { "id": "high", "requires_approval": 2, ... }
  ]
}
```

### `POST /sessions/start` and `POST /sessions/end`
Audit endpoints for session tracking.

## Adoption (Use != Adopt)

Approval is a review decision; promotion is what makes an asset usable. Both
candidate stores promote on approval, and the response says which store the
asset landed in.

| Endpoint | Candidate kinds promoted |
|---|---|
| `POST /candidate/:id/approve` | `skill` → `unifiedSkills` (`skill-<id>`), `persona` → `personas-evolved` (`persona-<id>`), `knowledge` → `knowledge-adopted` (`knowledge-<id>`) |
| `POST /core/governed/approve` | same three kinds, from the `@nemons/core` governed store |

**Response (approve):**
```json
{
  "candidate": { "id": "cand-abc123", "status": "adopted" },
  "adoption": { "promoted": true, "kind": "knowledge", "store": "knowledge_adopted" },
  "adopted_into": { "id": "knowledge-cand-abc123", "status": "adopted" }
}
```

When a kind has no destination, `adoption` reports why instead of implying the
asset is live:

```json
{
  "promoted": false,
  "reason": "rules_are_loaded_from_config",
  "detail": "Governance rules are read from governance/governance-rules.yml at boot; nothing promotes a candidate into them.",
  "kind": "rule",
  "status": "not_promotable",
  "supported_kinds": ["knowledge", "persona", "skill"]
}
```

Only adopted skills, personas, and knowledge are ever placed in a context pack.
A newly generated persona appears as `persona_candidate` with `"used": false`
until someone approves it.

### Candidate kinds

Registering a kind that approval could never adopt is refused with `400`, so no
candidate can reach status `adopted` with nothing consuming it. The table is
published by `GET /core/status` (`candidate_kinds`) and derived from
`nemos/src/utils/asset-kinds.js`.

| Kind | Adoption status | Why |
|---|---|---|
| `skill`, `persona`, `knowledge` | `live` | promoted into their store on approval |
| `memory` | `no_destination` | a context pack has no memory section |
| `experience` | `no_destination` | experiences arrive from verified runs, not approval |
| `rule` | `not_promotable` | loaded from `governance/governance-rules.yml` |
| `tool`, `adapter` | `not_promotable` | registered through their own contract APIs |
| `context_pack` | `not_promotable` | packs are built per request |

**Refusal (`POST /candidate/register`):**
```json
{
  "error": "unsupported_candidate_kind",
  "kind": "rule",
  "reason": "rules_are_loaded_from_config",
  "detail": "Governance rules are read from governance/governance-rules.yml at boot; nothing promotes a candidate into them.",
  "supported_kinds": ["knowledge", "persona", "skill"]
}
```

`POST /core/governed/propose` accepts the core's full `assetKind` set, so it
reports the same information instead of refusing it: `adoption.available` plus
the reason. Approval still records the decision, but the response never implies
an unpromoted asset is live.

## Core bridge (`/core/*`)

These endpoints expose `@nemons/core` through `nemos/src/utils/nemos-bridge.js`.
They answer `503` when the core `dist/` is not built.

### `GET /core/status`

**Response:**
```json
{
  "bridge_loaded": true,
  "core_path": "/repo/nemos-core/dist",
  "core_load_error": null,
  "available_apis": ["buildPersistentRuntime", "…", "P2.*"],
  "unavailable_apis": [],
  "bridge_integrity": { "loaded": true, "checked": 39, "missing": [] },
  "governed_store": { "kind": "file_backed", "records": 2 },
  "candidate_kinds": ["…"]
}
```

`available_apis` is the declared surface; the two fields after it are what makes
it a claim that can fail. `unavailable_apis` lists any declared name the bridge
cannot resolve to a function, and `bridge_integrity` reports the core symbols the
bridge source dereferences that the loaded namespace does not export.

A declared list alone was not enough, and that is the point: three wrappers
resolved to `undefined` one level deeper, inside the bridge. The audit reads the
bridge's own source instead of trusting a second list, because
`/core/validate/candidate` had been answering `400 valid: false` for every body,
including records the core itself produced — it called a `validateCandidate` that
does not exist and the route's `catch` reported the `TypeError` as invalid input.
CI asserts `unavailable_apis == []`, `bridge_integrity.checked > 30`, and
`bridge_integrity.missing == []`.

### `POST /core/validate/{persona,skill,run,evidence,experience,candidate,context-pack}`

Body is the record itself. `200 {"valid": true}` when the core's contract
validator accepts it, `400 {"valid": false, "error": "<ContractValidationError
message>"}` otherwise. The error text names the field; if it ever reads
`is not a function`, the bridge is broken rather than your payload.

### `POST /core/governed/{propose,request-review,approve,supersede,rollback}`

See **Adoption (Use != Adopt)** above — approval promotes into a store only for
the kinds that have one.

## Execution: dispatch vs. execution

Nemons decomposes a prompt into a DAG, spawns subagent records, and hands them
to the calling agent. It does **not** run them: an execution result exists only
when an executor is injected (`new SubagentOrchestrator(mgr, { executor })`),
which the daemon does not do. Nothing here reports an invented outcome.

### `POST /subagent/orchestrate`
```json
{
  "task": "implement the importer",
  "identity_id": "system"
}
```

**Response (abridged):**
```json
{
  "orchestrated": true,
  "orchestration": {
    "execution": "delegated_to_host",
    "subagents_spawned": 2,
    "subagents_dispatched": 2,
    "subagents_executed": 0,
    "subagents_succeeded": 0,
    "subagents_failed": 0
  },
  "results": [
    { "subagent_id": "sub-1", "status": "dispatched", "executed": false, "result": null }
  ],
  "message": "Spawned 2 subagents and dispatched them to the calling agent (0 failed to spawn, 0 retried). No subagent was executed by this daemon."
}
```

### `GET /subagent/orchestrator/stats`
Reports `execution_mode`, `total_dispatched`, `total_executed`,
`total_succeeded`, `total_failed`. With no executor, `total_succeeded` and
`total_failed` are `0` because nothing ran — not because everything failed.

## Evolution: generation vs. measurement

`POST /evolution/run` generates prompt and workflow variants. It has no
evaluator, so it cannot score them:

```json
{
  "scored": false,
  "evaluation_backend": "none",
  "results": {
    "mipro": {
      "variants": [
        { "variant": 0, "prompt": "// Optimized for clarity\n…" },
        { "variant": 1, "prompt": "// Focused on edge cases\n…" },
        { "variant": 2, "prompt": "// Emphasis on testing\n…" }
      ],
      "best_variant": null,
      "scored": false,
      "score_source": "unmeasured"
    }
  }
}
```

No `expected_score` is emitted and no "best" is selected, because both would be
inventions. Scoring requires injecting an evaluator:
`new EvolutionEngine({ evaluator: async (prompt, meta) => number })` — then
variants carry `expected_score` and `score_source: "external_evaluator"`.
`GET /evolution/stats` publishes `evaluation_backend` and
`capabilities.scores_variants` so a client can check before asking.

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (missing fields) |
| 401 | Unauthorized (bearer token required) |
| 404 | Resource not found |
| 429 | Rate limited (per route pattern) |
| 500 | Internal server error |
