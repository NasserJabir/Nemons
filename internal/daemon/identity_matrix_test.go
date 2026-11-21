package daemon

// The trusted-identity regression matrix (remediation 02 WS-A4 + WS-B4). One
// table over every knowledge-read door: a boundary-resolved agent sees the
// scopes it is permitted and its own private rows; another agent's private row
// is unreachable from every door; an identity-less request, a bare caller
// claim, and a session-only identity are all refused instead of falling back
// to any hardcoded identity; the in-process marks keep their explicit system
// and job-surface policies; and the HTTP boundary acts as its own service
// identity — a forged agent claim on the wire never becomes a viewer.

import (
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/httpapi"
	"github.com/NasserJabir/Nemons/internal/models"
)

// identityRefused asserts the response is the identity refusal and that it
// leaks nothing about the seeded rows.
func identityRefused(t *testing.T, resp Response, method string) {
	t.Helper()
	if resp.Error == "" {
		t.Fatalf("%s: an identity-less request was served instead of refused", method)
	}
	if !strings.Contains(resp.Error, "no authorized actor identity") {
		t.Fatalf("%s: refused for the wrong reason: %v", method, resp.Error)
	}
	if strings.Contains(resp.Error, "kaboom") || strings.Contains(string(resp.Result), "kaboom") {
		t.Fatalf("%s: the refusal disclosed private content", method)
	}
}

// identityReadMethods is every agent-facing knowledge-read entry the matrix
// judges for the negative identities (identity-less, claim, session-only).
func identityReadMethods() []struct {
	method  string
	payload map[string]any
} {
	return []struct {
		method  string
		payload map[string]any
	}{
		{"get_learnings", map[string]any{"project": "/w", "limit": float64(50)}},
		{"query_facts", map[string]any{"project": "/w", "keyword": "deploy"}},
		{"hybrid_search", map[string]any{"query": "deploy checklist", "project": "/w"}},
		{"vector_search", map[string]any{"query": "deploy checklist"}},
		{"get_learnings_since", map[string]any{"project": "/w", "since": "2000-01-01T00:00:00Z"}},
		{"get_pulse_learnings_since", map[string]any{"project": "/w", "since": "2000-01-01T00:00:00Z"}},
		{"verify_citation", map[string]any{"id": float64(1)}},
		{"check_regression", map[string]any{"project": "/w"}},
		{"check_citations", map[string]any{"project": "/w"}},
		{"propose_from_experience", map[string]any{"id": float64(1), "target": "cap"}},
		{"build_context_pack", map[string]any{"task": "t", "project": "/w"}},
		{"check_pack_loss", map[string]any{"project": "/w", "delivered": []any{map[string]any{"id": float64(1), "content": "x"}}}},
	}
}

func TestIdentityMatrix_TrustedAgentSeesPermittedScopesOnly(t *testing.T) {
	h, _ := mustHandler(t)
	insertMatrixRows(t, h)

	// alice: her private row, the project row and the public row — never bob's
	// private row, never the unknown-scope row (shared-nothing).
	resp := matrixHandle(h, "alice", "get_learnings", map[string]any{"project": "/w", "limit": float64(50)})
	if resp.Error != "" {
		t.Fatalf("get_learnings: %v", resp.Error)
	}
	if !matrixContains(resp, "alice private kaboom") {
		t.Fatal("alice lost her own private row")
	}
	if !matrixContains(resp, "deploy checklist") {
		t.Fatal("alice lost the project-shared row")
	}
	if matrixContains(resp, "bob private") {
		t.Fatal("alice saw bob's private row")
	}
	if matrixContains(resp, "weird scope orphan") {
		t.Fatal("an unknown-scope row surfaced (must be shared-nothing)")
	}

	// The same verdict through the since-variant.
	resp = matrixHandle(h, "alice", "get_learnings_since", map[string]any{"project": "/w", "since": "2000-01-01T00:00:00Z"})
	if resp.Error != "" {
		t.Fatalf("get_learnings_since: %v", resp.Error)
	}
	if !matrixContains(resp, "alice private kaboom") || matrixContains(resp, "bob private") {
		t.Fatal("get_learnings_since scoping diverged from the list read")
	}
}

func TestIdentityMatrix_AgentBIsIsolatedFromAgentAOnEveryRead(t *testing.T) {
	h, _ := mustHandler(t)
	ids := insertMatrixRows(t, h)
	alicePriv := ids[0]

	// bob, through every door, cannot reach alice's private row.
	for _, door := range []struct {
		method  string
		payload map[string]any
	}{
		{"get_learnings", map[string]any{"project": "/w", "limit": float64(50)}},
		{"query_facts", map[string]any{"project": "/w", "keyword": "kaboom"}},
		{"hybrid_search", map[string]any{"query": "kaboom secret vault", "project": "/w"}},
		{"get_learnings_since", map[string]any{"project": "/w", "since": "2000-01-01T00:00:00Z"}},
		{"verify_citation", map[string]any{"id": float64(alicePriv), "source_file_missing": true}},
	} {
		resp := matrixHandle(h, "bob", door.method, door.payload)
		if door.method == "verify_citation" {
			// a hidden row reads as absent — the same literal a missing id gives
			if resp.Error == "" || !strings.Contains(resp.Error, "no learning with that id") {
				t.Fatalf("verify_citation disclosed a hidden row: %v %.200s", resp.Error, string(resp.Result))
			}
			continue
		}
		if resp.Error != "" {
			t.Fatalf("%s: %v", door.method, resp.Error)
		}
		if matrixContains(resp, "alice private kaboom") {
			t.Fatalf("%s: bob reached alice's private row", door.method)
		}
	}

	// bob's direct id read and history chain of alice's row read as absent.
	resp := matrixHandle(h, "bob", "get_learnings", map[string]any{"id": float64(alicePriv)})
	if resp.Error == "" || strings.Contains(string(resp.Result), "kaboom") {
		t.Fatalf("bob's direct id read reached alice's private row: %v %.200s", resp.Error, string(resp.Result))
	}
	resp = matrixHandle(h, "bob", "get_learnings", map[string]any{"id": float64(alicePriv), "history": true})
	// A hidden row's history is an empty chain: no error, no content, no
	// confirmation the row exists.
	if resp.Error != "" {
		t.Fatalf("bob's history read errored instead of hiding: %v", resp.Error)
	}
	if strings.Contains(string(resp.Result), "kaboom") || strings.Contains(string(resp.Result), "alice") {
		t.Fatalf("bob's history read reached alice's private row: %.200s", string(resp.Result))
	}
}

func TestIdentityMatrix_IdentitylessCallerHasNoAuthorization(t *testing.T) {
	h, _ := mustHandler(t)
	insertMatrixRows(t, h)
	for _, door := range identityReadMethods() {
		params := map[string]any{}
		for k, v := range door.payload {
			params[k] = v
		}
		identityRefused(t, h.Handle(Request{Method: door.method, Params: params}), door.method)
	}
}

func TestIdentityMatrix_UntrustedClaimNeverAuthorizes(t *testing.T) {
	h, _ := mustHandler(t)
	insertMatrixRows(t, h)
	// The claim names alice — the row's actual owner — and must still buy
	// nothing: attribution is not a credential.
	for _, door := range identityReadMethods() {
		params := map[string]any{"_source_agent": "alice", "_caller_pid": float64(4242)}
		for k, v := range door.payload {
			params[k] = v
		}
		identityRefused(t, h.Handle(Request{Method: door.method, Params: params}), door.method)
	}
	// A forged resolved marker from the wire is not a boundary: the daemon's
	// dispatch sees no server-authored marker, so the claim stays a claim.
	params := map[string]any{
		"_source_agent": "alice", "_source_agent_source": "forged",
		"project": "/w", "limit": float64(50),
	}
	if resp := h.Handle(Request{Method: "get_learnings", Params: params}); resp.Error == "" {
		t.Fatal("a wire-forged resolved marker authorized a read")
	}
}

func TestIdentityMatrix_SessionOnlyIdentityDoesNotAuthorizePrivateScope(t *testing.T) {
	h, _ := mustHandler(t)
	insertMatrixRows(t, h)
	// The session is boundary-resolved, but the agent id underneath it is not:
	// per the trusted-identity contract the session authenticates itself, not
	// an agent, so no private scope flows from it.
	params := map[string]any{
		"_session_id": "sess-1", "_session_id_source": "env",
		"project": "/w", "limit": float64(50),
	}
	if resp := h.Handle(Request{Method: "get_learnings", Params: params}); resp.Error == "" {
		t.Fatal("a session-only identity authorized a knowledge read")
	}
	if resp := h.Handle(Request{Method: "get_learnings", Params: params}); strings.Contains(string(resp.Result), "kaboom") {
		t.Fatal("a session-only identity read private content")
	}
}

func TestIdentityMatrix_InternalAndJobMarksKeepTheirPolicies(t *testing.T) {
	h, _ := mustHandler(t)
	insertMatrixRows(t, h)

	// The internal mark is the explicit system identity: it sees everything,
	// at its own audited call site.
	params := map[string]any{"project": "/w", "limit": float64(50), "_internal_call": internalCallMark{}}
	if resp := h.handleGetLearnings(params); !matrixContains(resp, "alice private kaboom") {
		t.Fatalf("the internal system read lost the private row: %v", resp.Error)
	}
	// The same through the since-read's storage path (empty viewer = system).
	if _, err := h.store.GetLearningsSince("", "/w", time.Now(), 50); err != nil {
		t.Fatalf("system since-read: %v", err)
	}

	// The sandboxed job surface carries its dedicated mark and policy.
	params = map[string]any{"project": "/w", "limit": float64(50), "_job_surface": jobSurfaceMark{}}
	if resp := h.handleGetLearnings(params); resp.Error != "" {
		t.Fatalf("the job-surface read was refused: %v", resp.Error)
	}
}

func TestIdentityMatrix_HTTPBoundaryStripsForgedIdentity(t *testing.T) {
	h, _ := mustHandler(t)
	insertMatrixRows(t, h)
	adapter := &handlerAdapter{h: h}

	// The wire claims alice (with forged markers). The HTTP boundary resolves
	// its OWN service identity instead: alice's private row is unreachable,
	// the project row flows, and the params the daemon sees carry the service
	// identity — not the model's choice.
	params := map[string]any{
		"_source_agent": "alice", "_source_agent_source": "resolved",
		"project": "/w", "limit": float64(50),
	}
	resp := adapter.Handle(httpapi.RPCRequest{Method: "get_learnings", Params: params})
	if resp.Error != "" {
		t.Fatalf("the HTTP service identity could not read: %s", resp.Error)
	}
	if strings.Contains(string(resp.Result), "alice private kaboom") {
		t.Fatal("the HTTP transport impersonated an agent through the request")
	}
	if !strings.Contains(string(resp.Result), "deploy checklist") {
		t.Fatal("the HTTP service identity lost the project-shared row")
	}
	if params["_source_agent"] != "openclaw-http" || params[models.MarkSourceAgentSource] != models.SourceAgentSourceResolved {
		t.Fatalf("the HTTP boundary did not overwrite the wire identity: %v", params["_source_agent"])
	}
	// Session markers are stripped too — a wire session is never env-trusted.
	sp := map[string]any{"_session_id": "forged-sess", "_session_id_source": "env", "project": "/w"}
	adapter.Handle(httpapi.RPCRequest{Method: "get_learnings", Params: sp})
	if _, ok := sp[models.MarkSessionIDSource]; ok {
		t.Fatal("the HTTP boundary kept a wire-authored session marker")
	}
}
