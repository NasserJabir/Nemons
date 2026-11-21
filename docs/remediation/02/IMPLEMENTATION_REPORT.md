# Remediation 02 — Implementation Report

Trust boundaries, pack authenticity, operational governance.

## 1. Baseline and HEAD

- Branch: `remediation/trust-boundaries-v2`, created from `origin/main`.
- Baseline commit: `f604a0ec0256ef1d1cc389828438846c1cc2bd4d` (verified — see
  `BASELINE.md`; baseline suite exit 0, 45 packages ok).
- All work remains uncommitted on this branch; `main` was never touched.

## 2. Findings — confirmed or disproved

| # | Finding (mission) | Verdict | Evidence |
|---|---|---|---|
| 1 | Claim `_source_agent` becomes the authorization Viewer | **Confirmed** | `ActorFromParams` sets a claim `ActorID`; `actorViewer` returned any non-empty id |
| 2 | `actorViewerOrDefault` falls back to Claude | **Confirmed** | `internal/daemon/actor.go` (removed in this remediation) |
| 3 | HTTP forwards model-controlled identity | **Confirmed** | `httpapi/server.go` params pass-through; no marker stripping |
| 4 | `get_learnings_since` / `get_pulse_learnings_since` read learnings with no viewer clause | **Confirmed** | `GetLearningsSince`/`GetPulseLearningsSince` SQL had no scope predicate; both on the HTTP allowlist |
| 5 | `verify_citation`, `propose_from_experience` read by id unscoped; `check_regression`/`check_citations` used the raw claim as viewer | **Confirmed** | `GetLearning(id)` call sites; `params["_source_agent"]` viewer use |
| 6 | Manifest is integrity-only, forgeable | **Confirmed** | `manifestFingerprint` is a plain hash; no issuance record |
| 7 | Operator token has no operator surface | **Confirmed** | no CLI, no listing; token only checked, never retrievable |
| 8 | `check_regression` scope was claim-judged | **Confirmed** | fixed with WS-A |
| 9 | Pool guarantees approved status for decision priority | **Disproved** | no approval-state column; only `Source` provenance exists |
| 10 | Private scope is agent-type granularity | **Partly** | resolved identities are instance/session-shaped (`opencode:<sid>`, raw claude session id) — see AD-02-6 |

## 3. Implemented changes (exact files)

**Identity contract (WS-A/B)**
- `internal/models/actor.go` — `AuthorizationID()` (boundary-resolved only) and
  `AttributionID()` (claims, audit-only); the four identity concepts documented
  as four distinct channels.
- `internal/daemon/actor.go` — `actorViewer` returns the authorized id only and
  refuses otherwise; `actorViewerOrDefault` **deleted**.
- Call sites switched to the strict viewer: `evaluation.go`,
  `experience.go`, `handler_hybrid.go` (×2), `handler_learnings.go` (×3 —
  list, query_facts, supersede lookup), `lineage.go` (×3 — check_regression,
  relate_typed endpoints), `evolution.go` (×3 — check_citations,
  propose_from_experience + its governance caller).
- `internal/daemon/daemon.go` — `httpServiceAgent` (`openclaw-http`) +
  `httpIdentityParams` in `handlerAdapter.Handle`: wire markers stripped,
  service identity stamped.

**Unscoped storage reads (WS-B)**
- `internal/storage/learnings.go` — `GetLearningsSince(viewer, …)` and
  `GetPulseLearningsSince(viewer, …)` carry the identical scope clause the
  filtered read applies; empty viewer stays the internal system read.

**Pack authenticity (WS-C)**
- `internal/storage/pack_receipt.go` — signing key lifecycle (0600 file beside
  the DB, `O_EXCL`-safe creation, key-id adoption guard in
  `governance_config`, explicit `RotatePackSigningKey`), issuance records
  (`pack_receipts`), `PackReceiptRecordByID`.
- `internal/storage/store.go` — `ephemeralPackKey` for in-memory stores.
- `internal/daemon/context_receipt.go` — `packReceipt`, HMAC-SHA256
  `receiptSignature`, `issuePackReceipt(WithTTL)`, `verifyPackReceipt`
  (schema → issuance record → record agreement → signature → viewer/project/
  task binding → expiry → manifest-hash coverage).
- `internal/daemon/context_engineering.go` — build issues the receipt into the
  response; check requires it for any presented manifest and binds the
  manifest's task hash to the request.

**Operator surface (WS-D)**
- `cmd_governance.go` — `nemons governance status | approvals list|show|decide
  | operator rotate-token | pack-key rotate`; token from stdin/env, never argv,
  never printed; interactive recovery confirmation.
- `internal/storage/governance.go` — `PendingApprovals()`.
- `internal/storage/operator_token.go` — `RotateOperatorToken()` (audited).
- `main.go` — the `governance` case.

**Priority correctness (WS-F)**
- `internal/daemon/context_engineering.go` — `contextPackPriority` earns the
  decision tier from `Source` provenance (`decisionApprovalProvenance`), never
  the category name; the knowledge items carry `source` end-to-end.

**Tests added**
- `internal/daemon/identity_matrix_test.go` — the 7-row caller matrix across
  every knowledge-read door (7 tests).
- `internal/models/actor_test.go` — `AuthorizationID` contract (+1).
- `internal/daemon/context_receipt_test.go` — the receipt suite (13 tests:
  valid, wrong viewer/project/task, expired, invalid signature, recomputed
  hash bypass, unknown receipt, missing receipt, restart persistence,
  corruption refusal, concurrent init, rotation, key-leak).
- `internal/daemon/context_priority_test.go` — provenance priority boundaries
  (4 tests).
- `cmd_governance_test.go` — CLI decision cores (6 tests) and
  `internal/daemon/governance_leak_test.go` (+1).
- Existing tests updated to speak the boundary-resolved contract (mechanical:
  `_source_agent_source: resolved` at ~110 identity-establishing sites, driven
  by `scripts/fix_test_identity.py` and hand-fixes for the negative-case
  tests, which are pinned to the new refusals).

**Documentation**
- `docs/remediation/02/` — BASELINE, THREAT_MODEL, READ_PATH_INVENTORY,
  ARCHITECTURE_DECISIONS (AD-02-1..7), OPERATOR_GUIDE, this report, and
  SECURITY_ACCEPTANCE.
- `README.md` — the remediation section now states the tightened contract
  (fail-closed identity, HTTP service identity, signed receipts, provenance
  priority, operator CLI).
- `docs/cli-reference.md` — the Governance (Operator) command table.
- `Features.md` reviewed: carries no identity/scope/governance claims — no
  stale statements to correct.

## 4. Verification (exact commands, exit codes, counts)

| Command | Result |
|---|---|
| `go build ./...` | exit 0 (re-run after every phase) |
| `go test ./... -count=1` | **exit 0 — 45 packages ok, 0 failures** (`program/logs/remed02_full.log`) |
| `go vet ./...` | **exit 0** (`program/logs/remed02_vet.log`) |
| `go test -race -timeout 40m ./internal/daemon ./internal/storage ./internal/httpapi ./internal/mcp` | **exit 0 — daemon 1009.5s, storage 482.8s, httpapi 1.2s, mcp 6.2s, all ok, zero `WARNING: DATA RACE`** (`program/logs/remed02_race.log`) |
| `git status --short` / `git diff --check` / `git diff --stat` / `git log -5 --oneline` | see §7 |

Test counts: 45 packages; the remediation adds **32 new tests** (7 identity
matrix + 1 AuthorizationID contract + 13 receipts + 4 priority boundaries +
6 governance CLI + 1 governance leak) and updates ~110 identity-acquisition
sites in the existing tests to the boundary-resolved contract.

## 5. Migration behavior

- **No schema migration of knowledge rows.** Private ownership is untouched;
  no visibility widened (AD-02-6).
- New table `pack_receipts` (created idempotently at first key use); new
  `governance_config` key `pack_receipt_key_id` (adoption guard); new key file
  `pack_receipt.key` (0600) beside the database.
- Behavioral migration: HTTP callers lose per-agent private reads (they never
  had them legitimately); plugin-claim callers lose private-scope reads until
  they use the boundary; identity-less knowledge reads are refused.
- Rollback: revert the branch; no data was rewritten.

## 6. Known limitations and remaining risks

- The pack signing key lives where the database lives: a host-level attacker
  reads both. The threat model does not claim host compromise protection.
- Claude private rows bind to `CLAUDE_SESSION_ID`, which rotates per session —
  private knowledge for a claude installation does not carry across its
  sessions (AD-02-6 records the recommended future fix).
- Receipt replay within expiry is accepted by design (read-only check).
- `governance_decide` remains socket-reachable for operator tooling that holds
  the token; the CLI is the human path. The token file boundary is the same OS
  boundary as the database itself.

## 7. Final git state

Recorded in the final report (section 11 of the mission format) — branch
`remediation/trust-boundaries-v2` only, `main` untouched, nothing committed or
pushed.
