# Remediation 02 — Read-Path Inventory (WS-B1)

Every path by which a request reaches stored knowledge content, with the
boundary, identity source, viewer resolution, scope filtering and tests. This
inventory was built by reading the dispatch table (`internal/daemon/handler.go`
`Handle`), the handlers, and the storage getters they call — not by assumption.

## Legend

- **Boundary**: how the request arrives (MCP socket via the identity-resolving
  boundary; HTTP RPC pass-through; unix socket direct; in-process internal).
- **Identity**: what `models.ActorFromParams` yields on that transport.
- **Viewer**: what the handler passes to storage as the scope-deciding id.
- **Scoped?**: whether the learnings SQL actually filters on the viewer.
- "system" = the in-process internal/job marks (empty viewer = system read in
  storage, sees everything, audited call site).

## A. Knowledge (learnings) reads served to agents

| # | Method | Handler | Boundary | Identity source | Viewer resolution (baseline) | Scoped? | Tests (baseline) | Remediation |
|---|---|---|---|---|---|---|---|---|
| 1 | `get_learnings` | `handler_learnings.go:552` | MCP/HTTP/socket | claim accepted | `actorViewerOrDefault` → Claude fallback; claim ids accepted | yes (filter + `GetLearningForViewer`/chain) | scope_model, scope_matrix | WS-A/B: `actorViewer`, claims refused |
| 2 | `query_facts` | `handler_learnings.go:634` | MCP/HTTP/socket | claim accepted | `actorViewerOrDefault` → Claude fallback | yes (`QueryFactsOpts.Viewer`) | scope_model | WS-A/B |
| 3 | `hybrid_search` | `handler_hybrid.go:325` | MCP/HTTP/socket | claim accepted | `actorViewerOrDefault` → Claude fallback | yes (BM25 clause + `VisibleLearningIDs`) | scope_matrix | WS-A/B |
| 4 | `vector_search` | `handler_hybrid.go:791` | MCP/HTTP/socket | claim accepted | `actorViewerOrDefault` → Claude fallback | yes (`VisibleLearningIDs` post-filter) | scope_matrix | WS-A/B |
| 5 | `build_context_pack` | `context_engineering.go:266` | MCP/HTTP/socket | claim accepted | strict `actorViewer` (but claims pass) | yes (`GetActiveLearningsFiltered{Viewer}`) | context_manifest | WS-A |
| 6 | `check_pack_loss` | `context_engineering.go:344` | MCP/HTTP/socket | claim accepted | strict `actorViewer` (but claims pass) | yes (re-assembly / manifest) | context_manifest | WS-A + WS-C receipt |
| 7 | `get_learnings_since` | `handler_learnings.go` → `GetLearningsSince` | MCP/**HTTP**/socket | none used | **no viewer at all** | **no — private rows leak** | none | WS-B: viewer + scope clause |
| 8 | `get_pulse_learnings_since` | `handler_learnings.go:1122` | MCP/**HTTP**/socket | none used | **no viewer at all** | **no — leaks** | none | WS-B: viewer + scope clause |
| 9 | `verify_citation` | `evaluation.go:31` | MCP/HTTP/socket | none | `GetLearning(id)` unscoped | **no — by-id disclosure** | citation tests (no scope) | WS-B: `GetLearningForViewer` |
| 10 | `propose_from_experience` | `evolution.go:96` | MCP/HTTP/socket | raw claim as caller | `GetLearning(id)` unscoped; caller = claim | **no** | evolution tests | WS-B: viewer + authorized caller |
| 11 | `check_regression` | `lineage.go:21` | MCP/HTTP/socket | raw claim as viewer | `params["_source_agent"]` direct | partial (filter honors it) | regression tests | WS-A: `actorViewer` |
| 12 | `relate_typed` / `check_citations` | `lineage.go:89+` | MCP/HTTP/socket | none | `GetLearning(id)` on endpoints | **no — by-id disclosure** | lineage tests | WS-B: authorized reads |
| 13 | `get_fork_learnings` | `handler_fork.go:229` | socket (fork tooling) | session param | `GetForkLearnings(sessionID)` — own-session extraction rows | n/a (fork rows are `source='fork'`, session-keyed) | fork tests | documented (no sharing-scope rows) |
| 14 | `get_self_feedback` | `evaluation.go` | MCP/HTTP/socket | none | separate feedback table, user-level | n/a (not learnings) | existing | documented |

## B. Write/confirm paths that touch knowledge rows (existence oracle)

| Method | Concern | Remediation |
|---|---|---|
| `remember` (supersedes target) | already `GetLearningForViewer(rawCaller)` — but rawCaller accepts claims | WS-A: authorized caller only |
| `reopen` / `resolve` / `quarantine_session` | lifecycle ops by id; governed or operator-facing | audited; scope-judged where content returns |

## C. Reads outside the knowledge-scope model (no per-agent private data)

These return message/session/docs/proxy state — data types that carry no
`sharing_scope` in Nemons' model. They are bounded by their own parameters
(project, session id) and are inventoried for completeness, not changed:

`search`, `deep_search`, `expand_context`, `get_session`, `get_session_start`,
`get_session_flavors_*`, `get_compacted_stubs`, `get_pins`, `get_coverage`,
`get_active_gaps`, `project_summary`, `get_project_profile`, `get_persona`,
`get_evaluation_*` (non-knowledge parts), `docs_search`, `list_docs`,
`get_docs_hint`, `get_rules_block`, `index_status`, `list_projects`,
`get_knowledge_stats` (counts only).

## D. Internal/system reads (must stay intact)

- Consolidation, narrative and persona generation call `GetActiveLearnings`
  unscoped **in-process** (background flows, not agent-facing dispatch
  entries).
- `GetLearningsForClaudeMd`, `GetConsolidationLearnings`, staleness sweeps —
  internal maintenance.
- Sandboxed job reads (`job_socket.go` allowlist) carry `jobSurfaceMark`.
- `internalCallMark` sites act on audited decisions.

## E. Storage getters and their scope handling

| Getter | Viewer param | Used by agent-facing paths |
|---|---|---|
| `GetActiveLearningsFiltered(LearningsFilter)` | yes (`Viewer`) | 1, 5, 6, 11 |
| `QueryFacts(QueryFactsOpts)` | yes | 2 |
| `SearchLearningsBM25Ctx` | yes | 3 |
| `VisibleLearningIDs(viewer, project)` | yes | 3, 4 |
| `GetLearningForViewer` / `GetLearningChainForViewer` | yes | 1, remember-supersede |
| `GetLearningsSince` | **no → WS-B adds one** | 7 |
| `GetPulseLearningsSince` | **no → WS-B adds one** | 8 |
| `GetLearning(id)` | no (system form kept for internal callers) | 9, 10, 12, internal |
| `GetActiveLearnings` (unscoped) | no — internal flows only | consolidation/narrative/persona/caps |

## F. Transport identity policy (summary)

- **MCP**: the boundary always overwrites `_source_agent` with its env-resolved
  value and marks it `resolved`; caller-supplied markers are deleted. Trusted.
- **HTTP**: baseline forwards everything verbatim. Remediation: the HTTP
  boundary strips the caller's trust markers and acts as one explicit,
  documented service identity (`_source_agent_source=resolved`,
  `_source_agent=openclaw-http`); the model cannot choose it, and per-agent
  claims are attribution-only there.
- **Socket (non-MCP, same-UID)**: peer-identity methods (channel/broadcast/
  proxy/config) are already transport-guarded; knowledge reads on this
  transport follow the same `actorViewer` policy as MCP — a caller that cannot
  present a boundary-resolved identity is refused rather than defaulted.
