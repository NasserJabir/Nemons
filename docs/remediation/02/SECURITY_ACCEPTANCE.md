# Remediation 02 — Security Acceptance Matrix

Every criterion reports PASS / FAIL / NOT TESTED / NOT APPLICABLE with the
exact test or evidence. Test names are runnable:
`go test ./internal/daemon/ -run '<Name>' -v`.

| ID | Criterion | Verdict | Evidence |
|---|---|---|---|
| A-01 | Untrusted identity claims cannot become authorization identities | **PASS** | `TestIdentityMatrix_UntrustedClaimNeverAuthorizes` (claim naming the owner refused on all 12 read doors; forged wire marker refused); `TestAuthorizationID_RequiresBoundaryResolvedIdentity` (models contract); `TestActorViewerFailsClosedWithoutIdentity` |
| A-02 | HTTP cannot impersonate a Coding Agent | **PASS** | `TestIdentityMatrix_HTTPBoundaryStripsForgedIdentity` (forged alice claim + markers → service identity, private row unreachable, params overwritten, session markers stripped); enforcement at `handlerAdapter.Handle` (`httpIdentityParams`) |
| A-03 | Trusted MCP identity works correctly | **PASS** | `TestActorFromParams_ResolvedMarkerAuthenticates`; scope matrix green (`TestScopeMatrix_DirectIDAndList`, `_QueryFactsEnforcesScope`, `_HybridSearchBothLanesEnforceScope`) with resolved identities; MCP overwrite tests `TestBuildProxyParams_*` (Remediation 01, intact) |
| A-04 | Missing identity never becomes a hardcoded Agent Viewer | **PASS** | `actorViewerOrDefault` deleted; `TestIdentityMatrix_IdentitylessCallerHasNoAuthorization` (all 12 doors refuse); `TestScopeMatrix_PackSurfaceFailsClosedWithoutIdentity` updated to pin the refusal |
| B-01 | Every Agent-facing read enforces the same trusted identity policy | **PASS** | READ_PATH_INVENTORY §A (all knowledge doors) — every row now resolves through `actorViewer`; handlers switched: get_learnings, query_facts, hybrid/vector search, since + pulse variants, verify_citation, propose_from_experience, check_regression, check_citations, relate_typed, pack build/verify |
| B-02 | Private Knowledge isolation tested across all read paths | **PASS** | `TestIdentityMatrix_AgentBIsIsolatedFromAgentAOnEveryRead` (list, query_facts, hybrid, since, by-id, history); Remediation 01's scope matrix stays green; `TestReceiptWrongViewerRefused` on the pack surface |
| B-03 | Internal system access remains explicit and isolated | **PASS** | `TestIdentityMatrix_InternalAndJobMarksKeepTheirPolicies`; `TestScopeMatrix_InternalMarkIsTheOnlySystemRead`; marks are private Go types (`internalCallMark`, `jobSurfaceMark`) |
| C-01 | Context Pack receipts are server-authenticated | **PASS** | `TestReceiptValidDeliveryVerifiesLossless`; issuance record + HMAC in `context_receipt.go`; build response carries the receipt |
| C-02 | Modified Manifest is rejected | **PASS** | `TestManifestDetectsAlteredItems`, `TestManifestTamperingIsRefused` (fingerprint), `TestReceiptRecomputedHashCannotBypassAuthenticity` (receipt coverage) |
| C-03 | Recomputed ordinary hash cannot bypass authenticity | **PASS** | `TestReceiptRecomputedHashCannotBypassAuthenticity` — internally consistent manifest + recomputed fingerprint refused: `covers a different manifest` |
| C-04 | Receipt is bound to Viewer, Project, and Task | **PASS** | `TestReceiptWrongViewerRefused`, `TestReceiptWrongProjectRefused`, `TestReceiptWrongTaskRefused`; binding in `verifyPackReceipt` |
| C-05 | Key lifecycle survives restart and handles corruption safely | **PASS** | `TestReceiptKeySurvivesRestartAndRefusesCorruption` (restart verification OK; corrupted key → `corrupted` refusal; lost/replaced key → `state mismatch` refusal, no silent regeneration); `TestReceiptKeyConcurrentInitializationConverges`; `TestReceiptKeyRotationInvalidatesOldReceipts` |
| D-01 | Human operator can inspect pending approvals | **PASS** | `nemons governance status` / `approvals list` / `show`; `TestGovernancePendingListAndShow`; `storage.PendingApprovals` |
| D-02 | Human operator can approve or deny requests | **PASS** | `TestGovernanceDecideAuthorizedAllowAndDeny` (allow + deny land audited; re-decision refused — idempotent) |
| D-03 | Operator Token never reaches model-facing interfaces | **PASS** | `TestGovernanceDecideNeverLeaksTheToken` (daemon decide surface echoes nothing, success or refusal); `TestGovernanceNoTokenLeakageOnStorageSurfaces`; `governance_decide` is not an MCP tool (registration sweep, Remediation 01, intact); CLI reads token from stdin/env only |
| D-04 | Decisions are audited | **PASS** | `TestGovernanceDecideAuthorizedAllowAndDeny` (both verdicts recorded `by operator:cli`); rotation audited (`TestGovernanceRecoveryRotation`) |
| E-01 | Private identity semantics are explicitly documented | **PASS** | AD-02-6 (options compared, decision recorded, claude session-id gap stated); README remediation section; inventory §F |
| E-02 | No migration silently broadens data visibility | **PASS** | no knowledge-row migration ran; scope clauses only ever NARROW reads (since/pulse variants gained the clause); `TestGetLearningsSince` + matrix since-rows prove scoped output |
| F-01 | Decision priority reflects actual approval state | **PASS** | `TestDecisionPriorityIsEarnedByApprovalProvenance`; `decisionApprovalProvenance` uses the recorded `Source` (user_stated/agreed_upon), never the category name |
| F-02 | Budget selection remains deterministic and correct | **PASS** | `TestEqualPriorityOrdersNewestFirst`, `TestBudgetExhaustionDropsWholeItemsInReversePriority`, `TestMixedApprovalStatesUnderTightBudget`; Remediation 01's budget tests stay green |
| G-01 | Documentation matches the final implementation | **PASS** | README remediation section rewritten to the shipped behavior; `docs/cli-reference.md` Governance table; OPERATOR_GUIDE; every security statement maps to a test above |
| G-02 | CI and regression suite pass | **PASS** | full suite + vet + race results recorded in IMPLEMENTATION_REPORT §4 and the final report (section 7) |

## Test counts added by this remediation

- Identity matrix: 7 · AuthorizationID unit: 1 · Pack receipts: 13 ·
  Priority boundaries: 4 · Governance CLI: 6 · Governance leak: 1 — **32 new
  tests**, plus the existing suite updated to the boundary-resolved identity
  contract (~110 identity-acquisition sites).
