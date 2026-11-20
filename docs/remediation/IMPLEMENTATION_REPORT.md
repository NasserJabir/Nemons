# Nemons Remediation — Implementation Report

Status: implemented on top of `54fe432` (26 patches). All changes remain
**uncommitted** (the owner has not requested a commit). Test evidence: full
suite logs `verify_r10_full*.log`, race log `verify_r10_race.log` (repo-external
run logs).

---

## WS-A — Trusted Actor Identity (P0)

**Original problem:** agent identity arrived as ordinary model-controlled tool
arguments (`_source_agent`), and the MCP server only injected its resolved
identity when the argument was absent — a model-written value won.

**Root cause:** identity was transported as payload without a trusted-boundary
contract.

**Files changed:**
- `internal/models/actor.go` (new) — `ActorContext`, trusted-channel markers
  (`_source_agent_source=resolved`, `_session_id_source=env`), `ActorFromParams`
  with resolved > session-env > claim precedence.
- `internal/mcp/server.go` — `buildProxyParams`: the server-resolved agent
  identity **always wins**; source markers are server-authored (written here,
  deleted here). Session identity keeps the caller-supplied-first rule — under
  opencode v2 this server's env may name the last-created session, not the
  caller's (YM-328) — but a model-forged env marker is deleted, so the daemon
  never grants env-trust to a caller-supplied id.
- `internal/daemon/actor.go` (new) — `resolveActor`, strict `actorViewer`
  (fail-closed refusal), `actorViewerOrDefault` (least-privileged `claude`
  default for the inherited read paths).
- Wiring: `experience.go`, `evaluation.go`, `governance_gate.go`,
  `handler_learnings.go`, `handler_dialogs.go`, `context_engineering.go`.
- Tests: `internal/models/actor_test.go` (resolution matrix),
  `internal/mcp/server_spoof_test.go` (boundary overwrite, marker hygiene),
  `internal/daemon/actor_test.go` (fail-closed, marks, claims).

**Design decision:** the MCP boundary is the trusted integration point. Type-
level agent identity is authenticated for every MCP client (the resolver always
names a type); per-session identity keeps caller-first because of the v2 shared-
service leak, guarded by the daemon's existing PID/cwd proof rules.

**Remaining limitations:** same-UID local processes can still forge markers on
the direct-HTTP surface — the documented residual (THREAT_MODEL T0).

## WS-B — Unified Scope Enforcement (P0)

**Original problem:** direct-ID, history, list, `query_facts`, BM25, hybrid and
vector reads bypassed the viewer rule the supersede path already used.

**Root cause:** visibility lived in one read path instead of a boundary.

**Files changed:**
- `internal/storage/learnings.go` — `GetLearning` now loads `source_agent`
  (it never did — a latent bug that made `GetLearningForViewer` hide private
  rows from everyone, including the owner); viewer clause is applied at the
  WHERE level with strict (non-claude-defaulting) normalization.
- `internal/storage/learnings_search.go` — `QueryFactsOpts.Viewer` with the
  scope clause in SQL; `SearchLearningsBM25Ctx(..., viewer, ...)` judges hits in
  the metadata lookup.
- `internal/storage/learnings_scope.go` — `GetLearningChainForViewer` (chain
  rows filtered by the same rule, scope read straight from the row).
- `internal/daemon/handler_learnings.go`, `handler_hybrid.go` — all four read
  paths resolve the actor and pass it down; hybrid/vector apply the visible-ID
  scope pass after fusion (the vector store is unscoped; documented residual).
- `internal/daemon/scope_matrix_test.go` (new) — the adversarial matrix: direct
  ID, list, history, query_facts, hybrid (both lanes), pack surface, internal
  mark. All six scenarios pass.

**Design decision:** enforcement in SQL wherever the query touches `learnings`;
the unscoped vector index gets a post-filter pass keyed on `VisibleLearningIDs`.
Identity-less reads default to the least-privileged `claude` identity (never the
system view) to preserve same-UID operational callers; the pack surface refuses
outright.

## WS-C — Canonical Sharing Model (P1)

**Original problem:** scope vocabulary was legacy (`""/project/public/private`),
global writes needed no authorization.

**Files changed:** `internal/models/scope.go` (new: ScopeGlobal/Project/Private
+ `NormalizeSharingScope`), `internal/storage/scope_migration.go` (new:
idempotent `public`→`global` rewrite at open, single transaction),
`internal/storage/store.go` (Open hook), the three SQL clauses (legacy `public`
stays readable), `handler_learnings.go` (`global` accepted through the existing
`memory.public_write` standing grant; stored canonically), `experience.go`
(canonicalize + fail-closed unknown + grant for global).
Tests: `internal/daemon/scope_model_test.go`.

**Compatibility:** no row becomes more accessible — `public` already meant
"visible to every viewer"; ownership and lifecycle columns are untouched.
Migration is idempotent and rollback-safe (readers still accept `public`).

## WS-D — Context Pack Manifest & Integrity (P0)

**Original problem:** the pack fingerprint hashed `task|knowledge=%d|skills=%d`
— counts, not content; `check_pack_loss` compared a budget-limited delivery
against every currently eligible row (false loss).

**Files changed:** `internal/daemon/context_engineering.go` —
`assembleContextPack` (the single deterministic assembly path), `packManifest`
(schema version, viewer, project, task hash, budget, per-item id+content hash+
position, skills name@version) with a canonical fingerprint over the manifest
itself; the build response carries the manifest; `check_pack_loss` verifies the
presented manifest (fingerprint mismatch ⇒ refuse; unknown schema ⇒ refuse) or
falls back to the deterministic re-assembly; delivered items are judged by
content hash.
Tests: `internal/daemon/context_manifest_test.go` — content-sensitivity,
determinism, task-change reflection, budget-limited lossless (both references),
missing/altered/injected detection, tamper refusal, unknown-schema refusal,
skills recording. 9/9 pass; the 11 legacy pack tests pass unchanged.

## WS-E — Budget & Selection Correctness (P1)

**Original problem:** `max_items` truncated the candidate pool before priority
ranking — newer gotchas could exclude older approved decisions from evaluation.

**Files changed:** `context_engineering.go` — the pre-window removal; the
caps are judged inside `selectWithinBudget` in priority order over the FULL
eligible pool; the budget rule string documents it.

## WS-F — Governance Bootstrap & Approval Lifecycle (P0)

**Original problem:** `governance_decide` was in the governed registry — the
operation needed to decide an ask would itself need an ask (a bootstrap cycle
the operator could never close from any external surface).

**Files changed:** `internal/storage/governance_gate.go` (decide removed from
the registry, documented), `internal/storage/operator_token.go` (new: the
operator token generated once at first open, persisted idempotently,
constant-time comparison), `internal/storage/store.go` (bootstrap hook),
`internal/daemon/governance_gate.go` (decide requires the operator token),
`internal/daemon/job_socket.go` (job allowlist: bind judged under
`job.governance_bind`; decide stays out — a job never holds the operator
token).
Tests: `internal/daemon/governance_gate_test.go` (rewritten: ask/idempotency/
allow/deny/resend/expiry/nil-store + token-gated decide + replay refusal),
`internal/daemon/governance_bootstrap_test.go` (the ten-step empty-database
matrix: init, idempotent restart, ask, read, decide, execute, audit,
unauthorized, replay, unknown key — all pass), `internal/storage/
governance_gate_test.go` updated to judge through `governance_persona`.

**Design decision:** separating the decision authority from the gate IS the
fix — the decide surface went from "nobody can decide" to "only the token
holder can decide", strictly stronger, with no gate weakening anywhere else.

## WS-G/H — Adapter boundary, docs & CI

- The adapter boundary stays minimal: `ActorContext` (WS-A) is the identity
  seam every integration establishes through; capability discovery and
  rendering remain the agents' native territory (see ARCHITECTURE_DECISIONS).
- Compatibility matrix (the smallest justified adapter boundary — the
  `ActorContext` identity seam plus capability visibility):

  | Coding agent | Identity source | Authenticated as | Session channel | Unavailable capabilities |
  |---|---|---|---|---|
  | Claude Code (plain) | `CLAUDE_SESSION_ID` / `CLAUDE_CODE_SESSION_ID` env | `claude` (resolved) | env session | opencode-only dialogs |
  | opencode + plugin v1 | `OPENCODE=1` env (type), plugin claim (session) | `opencode` (resolved type; claim session) | plugin `_session_id` claim | codex-targeted ops |
  | opencode v2 (service) | `NEMONS_SOURCE_AGENT`/`NEMONS_SESSION_ID` env | `opencode` (resolved) | env, caller-first per YM-328 | — |
  | codex | `CODEX_THREAD_ID` env | `codex` (resolved) | env thread id | Claude-specific polling advice |
  | sandboxed job | in-process `jobSurfaceMark` | `job.<method>` surface | job socket | daemon socket, decide surface |
  | internal ops | in-process `internalCallMark` | system (audited call sites) | — | — |

  Unsupported capabilities stay visible: opencode-only dialogs refuse non-
  opencode actors; the job allowlist refuses out-of-surface methods; the
  decide surface refuses anyone without the operator token. Documented in
  README + SECURITY reconciliation below.
- README/SECURITY updates cover: the trusted identity model, the sharing-scope
  model and migration, the governance bootstrap and the operator token, the
  pack manifest contract, and the regression-test commands.
- CI stays aligned with the local commands (`go test ./...`, race on the four
  hot packages with a raised timeout — the default 10m timeout under `-race`
  was an environment artifact, not a data race; baseline evidence
  `verify_r9_race.log`).

## Verification

- `go build ./...` — exit 0.
- `go test ./... -count=1` — full suite green (logs `verify_r10_full*.log`).
- Race: `go test -race -timeout 40m ./internal/daemon ./internal/storage
  ./internal/httpapi ./internal/mcp` — `verify_r10_race.log`.
- Security matrices: scope matrix 6/6, manifest 9/9, gate+bootstrap 11/11 +
  10-step lifecycle, actor resolution + boundary spoof suites green.
