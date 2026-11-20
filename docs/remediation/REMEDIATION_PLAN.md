# Nemons Remediation Plan

Status: IMPLEMENTED (all workstreams A–F complete with green test matrices;
G/H reconciled). Evidence: docs/remediation/{IMPLEMENTATION_REPORT,
SECURITY_ACCEPTANCE,ARCHITECTURE_DECISIONS}.md. Phase 0 record:

Phase 0 complete — all findings below are code-verified on HEAD `54fe432`
(`git rev-list d0bba3f4..HEAD` = 26 patches, working tree clean).
Baseline: `go build ./...` exit 0; `go test ./... -count=1` exit 0 — **45 ok, 0 fail**.
Baseline commands and logs: `program/logs/verify_r9_baseline.log` (repo-external run log),
race results under `internal/daemon|storage|httpapi|mcp` recorded in the
implementation report.

## Confirmed findings (evidence, severity, root cause)

### F-1 (P0, Security) — Agent identity is model-controllable
Evidence: `internal/mcp/server.go:130-133` — the MCP server resolves an
authoritative `sourceAgent` from its own environment (`resolveClientSessionID`)
but injects it only when `params["_source_agent"]` is **not already present**;
a model-written tool argument therefore overrides the server-resolved identity.
The same ordering applies to `_session_id` (server.go:127-129). Daemon-side,
`_source_agent` is read out of `params` as the viewer/caller in at least 10
places (`internal/daemon/experience.go:85,110,153`, `evaluation.go:165`,
`handler_dialogs.go:156,198,226,259`, `context_engineering.go:119,240`,
`governance_gate.go:49`). Root cause: identity is transported as ordinary
model-writable payload; no trusted-boundary marker exists for it.

### F-2 (P0, Security) — Several agent-facing reads bypass the scope view
Evidence (HEAD):
- `handler_learnings.go` `handleGetLearnings`: direct-ID path calls
  `GetLearning` and the history path calls `GetLearningChain` — neither applies
  the viewer rule that `GetLearningForViewer` implements
  (`internal/storage/learnings_scope.go:20-44`).
- The list path builds `storage.LearningsFilter` **without** the `Viewer`
  field, while the filter implementation applies the scope clause only when
  `f.Viewer` is non-empty (`internal/storage/learnings.go:675-677`).
- `handleQueryFacts` (`handler_learnings.go:624`) → `QueryFacts`
  (`internal/storage/learnings_search.go:72`): the SQL has no scope clause at
  all.
- `handleHybridSearch` (`handler_hybrid.go:322`) and `handleVectorSearch`
  (`handler_hybrid.go:751`): no viewer anywhere in the lane setup or merge; the
  vector lane reads the embedding store directly.
- The scope primitives exist but are used in exactly one place
  (`handler_learnings.go:75`, the supersede path).
Root cause: visibility was enforced at the read the upstream chain touched, not
at a unified boundary; every later read path inherited the bypass.

### F-3 (P0, Security) — Empty viewer is a privileged system read
Evidence: `internal/storage/learnings_scope.go:19,26-28` — "An empty viewer is
a system read and sees everything"; the daemon handler layer passes
`_source_agent` (or nothing) straight into the viewer, so a request without an
agent field silently reads as the system. Root cause: no explicit internal
system identity; absence of identity is treated as privilege instead of failing
closed.

### F-4 (P0, Integrity) — Pack fingerprint hashes counters, not content
Evidence: `internal/daemon/context_engineering.go:177` —
`ContentHash(fmt.Sprintf("task=%s|knowledge=%d|skills=%d", ...))`. Two packs
with the same task and identical item counts but different content share a
fingerprint. Root cause: the fingerprint was designed for audit tying, then
relied on as if it proved delivered content.

### F-5 (P0, Integrity) — `check_pack_loss` compares against the wrong universe
Evidence: `context_engineering.go:244-256` — the check re-derives `expected`
from **all** currently eligible rows with no `max_items`/`budget_chars`
applied, while the build drops whole items under those limits
(`selectWithinBudget`, line 147). Any budget-limited delivery reports false
`missing` claims. Root cause: the check re-simulates retrieval instead of
comparing against the exact manifest the build selected.

### F-6 (P0, Governance) — `governance_decide` is governed by itself
Evidence: `internal/storage/governance_gate.go:36` lists `governance_decide`;
`internal/daemon/governance_gate.go:79-94` is the only external decision
surface (`DecideApproval` has no other caller). A first-ever decide packet
derives its own key, finds no approval, opens an ask for itself; resending the
identical packet re-reads the same key and hits "still open". The gate cannot
be closed from the operator surface. Root cause: the decision authority and the
governed-operation registry were merged instead of separated.

### F-7 (P1, Correctness) — `max_items` caps candidates before priority runs
Evidence: `context_engineering.go:141-143` truncates the curated knowledge list
to `max_items` (newest-first) **before** `selectWithinBudget` performs its
priority-ordered selection (line 147). An older approved decision can be
excluded from the candidate pool by newer gotchas and never reaches priority
evaluation. Root cause: two caps applied at different layers with the
arbitrary one first.

### F-8 (P1, Model) — Scope vocabulary is legacy, ownership implicit
Evidence: scope values on disk are `""`, `"project"`, `"public"`, `"private"`
(`learnings_scope.go:29-43`); "public" means globally visible, ownership rides
on `SourceAgent`, and no transition rule prevents implicit promotion. Root
cause: the upstream scope vocabulary predates the Global/Project/Private
target model.

### F-9 (P2, Architecture) — Integrations share one param-building path
Evidence: `buildProxyParams` (`internal/mcp/server.go:106-145`) is the single
trusted boundary; adapters (Claude Code plain, opencode plugin v1/v2, codex)
differ only in what the environment resolves. No capability discovery or
adapter contract exists; the residual same-UID exposure is documented only in
comments (`daemon.broadcastSender`). Root cause: adapter behavior accumulated
in one function without a contract.

## Planned changes and dependencies

| # | Workstream | Fixes | Depends on |
|---|---|---|---|
| 1 | WS-A Trusted actor identity | F-1, F-3 | — |
| 2 | WS-B Unified scope enforcement | F-2, F-3 | WS-A |
| 3 | WS-D Pack manifest + integrity | F-4, F-5 | WS-A (viewer in manifest) |
| 4 | WS-F Governance bootstrap | F-6 | — |
| 5 | WS-E Budget/selection correctness | F-7 | WS-D (selection feed) |
| 6 | WS-C Canonical sharing model | F-8 | WS-B (scope clause owner) |
| 7 | WS-G Adapter boundary + WS-H docs/CI | F-9, docs | all above |

Acceptance criteria per workstream are the checklists in
`SECURITY_ACCEPTANCE.md`; the adversarial test matrix (WS-B) is the single
matrix required by the mission and is implemented as
`internal/daemon/scope_matrix_test.go`.

## Non-goals (explicit)

- No rewrite of the daemon/proxy/storage architecture; the enforcement gate,
  approval lifecycle and event ledger keep their designs.
- No new dependencies; SQLite stays single-file with parameterized SQL.
- No advertised-version change; no commits without the owner's request.
