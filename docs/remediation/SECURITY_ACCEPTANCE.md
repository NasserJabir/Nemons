# Nemons Remediation — Security Acceptance

Machine-verifiable checklist. Every line names the enforcement code and the
test that proves it. Evidence logs: `verify_r10_full*.log`,
`verify_r10_race.log`.

## Identity

- [x] Agent identity is established through a trusted boundary.
  — `internal/mcp/server.go` `buildProxyParams` (server-resolved identity
  always wins; markers server-authored) —
  `internal/mcp/server_spoof_test.go::TestBuildProxyParams_ResolvedIdentityWinsOverModelFields`.
- [x] Model-controlled arguments cannot spoof identity.
  — same boundary code — `TestBuildProxyParams_ClaudeClientIsAuthenticatedAsClaude`,
  `TestBuildProxyParams_UnresolvedSessionMarkerIsDeleted`.
- [x] Missing identity fails closed on protected operations.
  — `internal/daemon/actor.go::actorViewer` refusal —
  `internal/daemon/actor_test.go::TestActorViewerFailsClosedWithoutIdentity`,
  `scope_matrix_test.go::TestScopeMatrix_PackSurfaceFailsClosedWithoutIdentity`.
- [x] Session and actor binding are validated.
  — `internal/models/actor.go` marker precedence + daemon PID/cwd proof chain
  (`provenSessionID`) — `models/actor_test.go` matrix; caller-first session
  per YM-328 pinned by `TestBuildProxyParams_...UnresolvedSession...` and the
  daemon env tests.

## Isolation

- [x] Every agent-facing Knowledge read enforces scope.
  — list path `LearningsFilter.Viewer` clause (`learnings.go`) —
  `scope_matrix_test.go::TestScopeMatrix_DirectIDAndList`.
- [x] Direct ID lookup enforces scope.
  — `GetLearningForViewer` — same test.
- [x] Search and hybrid search enforce scope.
  — BM25 metadata clause + hybrid visible-ID scope pass —
  `TestScopeMatrix_HybridSearchBothLanesEnforceScope`.
- [x] Vector search enforces scope.
  — vector scope pass — same test.
- [x] Query Facts enforces scope.
  — `QueryFactsOpts.Viewer` SQL clause —
  `TestScopeMatrix_QueryFactsEnforcesScope`.
- [x] History and lineage reads enforce scope.
  — `GetLearningChainForViewer` — `TestScopeMatrix_HistoryDoesNotDisclose`.
- [x] Context retrieval enforces scope.
  — `assembleContextPack` viewer-gated fetch —
  `context_engineering_test.go::TestContextPackHidesPrivateRowsFromOtherViewers`.
- [x] Export and other exposure paths reviewed.
  — summaries/experience/evaluation pass actor scopes
  (`experience.go`, `evaluation.go`); audit lines record counters only
  (`context_engineering.go`), diagnostics read via in-process system identity.
- [x] Cross-agent adversarial tests pass.
  — the six-scenario matrix `scope_matrix_test.go`.

## Context Integrity

- [x] Fingerprint covers canonical actual content.
  — `manifestFingerprint` over per-item content hashes —
  `context_manifest_test.go::TestManifestFingerprintCoversContentNotCounts`.
- [x] Manifest records exact selected items.
  — `packManifest.Knowledge` (id/hash/position) —
  `TestManifestFingerprintIsDeterministic`, `TestManifestRecordsSkills`.
- [x] Budget exclusions are not false losses.
  — manifest or deterministic re-assembly reference —
  `TestBudgetLimitedDeliveryIsNotLoss`.
- [x] Missing and altered items are detected.
  — `TestManifestDetectsMissingSelectedItems`, `TestManifestDetectsAlteredItems`.
- [x] Unauthorized injected items are detected.
  — `TestManifestDetectsInjectedItems`.
- [x] Manifest integrity is verifiable.
  — fingerprint re-verification + schema gate —
  `TestManifestTamperingIsRefused`, `TestManifestUnknownSchemaRefused`.

## Governance

- [x] First-run bootstrap works from an empty database.
  — `storage.Open` bootstrap hook —
  `governance_bootstrap_test.go::TestGovernanceBootstrap_FromEmptyDatabase`
  (steps 1–7).
- [x] Approval authority is authenticated.
  — `OperatorTokenOK` constant-time gate on the decide surface —
  `governance_gate_test.go::TestOperatorTokenGatesDecide`, bootstrap step 8.
- [x] Governed operations cannot bypass approval.
  — gate before dispatch on governed methods —
  `TestGateGovernedCallAsksFirst`, `TestGateOpenAskStillBlocksResends`.
- [x] Replay and mismatched approvals are rejected.
  — `ErrApprovalNotOpen` / unknown-key refusals —
  `TestGovernanceReplayRefused`, bootstrap steps 9–10.
- [x] Audit records are produced.
  — `GovernanceSnapshot` assertions in the gate tests; bootstrap step 7.

## Sharing

- [x] Global, Project, and Private semantics are explicit.
  — `internal/models/scope.go` — `scope_model_test.go::TestNormalizeSharingScope_Matrix`.
- [x] Ownership is independent from scope.
  — migration rewrites the scope column only —
  `TestScopeMigration_RewritesPublicWithoutWideningAccess`.
- [x] Lifecycle is independent from scope.
  — same migration + recallability predicate untouched (same test).
- [x] Invalid scope fails closed.
  — `NormalizeSharingScope` → write refusals —
  `TestRemember_UnknownScopeStillRefused`, experience refusal.
- [x] No implicit promotion occurs.
  — default stays project-shared; global needs the standing grant —
  `TestRemember_DefaultStaysProjectNoImplicitPromotion`,
  `TestRemember_GlobalScopeRequiresTheStandingGrant`.
- [x] Legacy migration preserves restrictions.
  — `public`→`global` rewrite, ownership/lifecycle untouched, readers accept
  legacy values — `TestScopeMigration_RewritesPublicWithoutWideningAccess`.

## Quality

- [x] Existing regression suite passes — `verify_r10_full*.log` (full suite).
- [x] New security tests pass — the matrices above.
- [x] Race tests pass — `verify_r10_race.log` (storage/httpapi/mcp green
  under `-race -timeout 40m`, zero `WARNING: DATA RACE`) and
  `verify_r10_race_daemon_final.log` (daemon green on the final code, exit 0,
  888s). The first daemon race run (same log) raced a mid-way test tree — its
  failures are stale test messages, superseded by the final run. The baseline
  `-race` failure was the default 10-minute timeout (`verify_r9_race.log`,
  environment artifact).
- [x] Build passes — `go build ./...` exit 0.
- [x] Static analysis — `go vet` clean on the touched packages.
- [x] No unexplained test skips — the only skip is the mirror-hygiene
  environment guard (`git ls-files unavailable`), pre-existing.
- [x] No secrets or private Knowledge in logs — audit lines carry counters and
  fingerprints only; the operator token is never included in agent-facing
  responses (`operator_token.go` doc contract).
- [x] Documentation reflects actual implementation — README/SECURITY
  reconciled (WS-H section of IMPLEMENTATION_REPORT).

## Residual, explicitly not claimed

1. Same-UID local process forging boundary markers on the direct-HTTP surface
   (T0 residual; OS boundary is the mitigation).
2. Vector-lane scope filtering happens after retrieval (top-k slots).
3. The ordinary content hash is integrity, not a signature (no key material
   involved; stated in the manifest docs).
