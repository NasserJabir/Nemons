# Remediation 02 — Baseline (Phase 0)

## Repository state at audit time

| Item | Value |
|---|---|
| Repository | `github.com/NasserJabir/Nemons` |
| Expected baseline commit | `f604a0ec0256ef1d1cc389828438846c1cc2bd4d` |
| Actual `origin/main` at audit | `f604a0ec0256ef1d1cc389828438846c1cc2bd4d` — **matches** |
| Working branch | `remediation/trust-boundaries-v2` (created from `origin/main`) |
| Parent state | Remediation 01 (WS-A..H) as pushed in commit `f604a0e` |

## Baseline commands and results

Executed on a clean checkout of `f604a0e`, before any edit:

| Command | Result |
|---|---|
| `go build ./...` | exit 0 — `BASELINE_BUILD_OK` |
| `go test ./... -count=1` | **exit 0, 45 packages ok, 0 failures** (`program/logs/baseline02_test.log`) |

No pre-existing failures to record. `go vet` and `-race` run in the final validation phase (§ Final Validation of the mission).

## Remediation 01 controls verified in place (must remain intact)

- `internal/models/actor.go` — ActorContext with `IdentitySource` (resolved / session-env / claim / none) and boundary-authored markers (`_source_agent_source: resolved`, `_session_id_source: env`).
- `internal/models/scope.go` + `internal/storage/scope_migration.go` — canonical scopes (global/project/private), legacy `public`→`global` migration, unknown-scope write refusal.
- `internal/daemon/actor.go` — `actorViewer` (fail-closed on empty actor id) and `actorViewerOrDefault` (Claude compatibility default — this remediation removes it, see WS-B).
- `internal/daemon/context_engineering.go` — deterministic `assembleContextPack`, canonical manifest fingerprint, `check_pack_loss` against manifest or re-assembly (WS-D/E of Remediation 01).
- `internal/storage/operator_token.go` — operator token generated once at first store open, constant-time comparison; `governance_decide` requires it and stands outside the job allowlist.
- `internal/daemon/job_socket.go` — sandboxed jobs judged under `job.governance_bind`; `governance_decide` not in the job allowlist.

## Findings confirmed by this audit (driving the workstreams)

1. **Claims authorize (WS-A)**: `ActorFromParams` gives a caller-supplied `_source_agent` claim a non-empty `ActorID` (marked `IdentitySourceClaim`, `Authenticated=false`), and `actorViewer` returns *any* non-empty `ActorID` without checking `Authenticated`. A forged claim therefore becomes the authorization Viewer and can read another agent's private rows.
2. **Identity-less reads read as Claude (WS-B)**: `actorViewerOrDefault` falls back to `models.SourceAgentClaude`; six agent-facing read handlers use it (`get_learnings`, `query_facts`, `hybrid_search`, `vector_search`, `get_evaluation_summary`, `get_experience_summary`).
3. **HTTP passes model-controlled identity through (WS-A3)**: `internal/httpapi/server.go` forwards params verbatim into the daemon (inner gate `handlerAdapter`, `daemon.go:1826+`), so an HTTP caller can steer the viewer by `_source_agent`; localhost + bearer token authenticates *the host integration*, not an agent.
4. **Unscoped knowledge reads (WS-B)**: `get_learnings_since` → `GetLearningsSince(project, since, limit)` and `get_pulse_learnings_since` → `GetPulseLearningsSince(project, since, limit)` issue learnings SQL with **no viewer clause** — private rows of any agent leak, and both methods are on the HTTP allowlist. `verify_citation` and `propose_from_experience` read `GetLearning(id)` unscoped by id (existence + content disclosure). `check_regression` uses `params["_source_agent"]` (a claim) directly as the viewer. `propose_from_experience` also uses the raw claim as `caller`.
5. **Manifest is integrity-only (WS-C)**: the Context Pack manifest carries an ordinary content hash (`manifestFingerprint`); no server-issued authenticity. A caller who rewrites manifest + fingerprint together passes `check_pack_loss`.
6. **Operator token has no operator surface (WS-D)**: the token is generated at first open and checked by `governance_decide`, but no CLI/local interface exists to inspect approvals or present the token, and nothing retrieves it for a human operator. `governance_decide` is not registered as an MCP tool (verified — no hits in `internal/mcp/server.go`), so the model cannot reach it directly; the gap is operational, not model-facing.
7. **Private-scope granularity is resolution-dependent (WS-E)**: for resolved MCP identities, `ActorID` is `opencode:<session-id>` / `codex:<thread-id>` / raw `CLAUDE_SESSION_ID` — i.e. effectively per-session instance identity with different shapes per agent type; for plugin-channel claims it is a bare type label. `ViewerID()` returns `ActorID` unchanged. No schema or ownership semantics decision is recorded anywhere.
8. **Decision priority does not prove approval (WS-F)**: `contextPackPriority` ranks by category name only. The `Learning` model has **no approval-state field**; the closest recorded provenance is `Source` (`user_stated`, `agreed_upon`, `claude_suggested`, `llm_extracted`, `fork`). The eligible pool does not guarantee approved status.

## Architecture preserved

SQLite storage, the daemon/MCP/HTTP transports, the CAP/governance model, the scope model and the Remediation 01 controls above are all kept. This remediation narrows trust boundaries; it does not replace subsystems or add a runtime.
