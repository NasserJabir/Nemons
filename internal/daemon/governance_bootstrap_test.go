package daemon

// The governance bootstrap matrix (remediation WS-F): starting from a
// completely empty database on disk, the system initializes itself, the
// operator identity comes into existence without any manual DB edit, the
// full approval lifecycle runs — ask, read, decide, execute, audit — and the
// unauthorized paths (no token, wrong token, replay, unknown key) all refuse.

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/NasserJabir/Nemons/internal/storage"
)

// newBootstrapFixture opens a real file-backed store twice: once to prove the
// first-run bootstrap, once to prove the initialization is idempotent and the
// token survives a restart. The handler is wired to that same store.
func newBootstrapFixture(t *testing.T) (*Handler, *storage.Store, string) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "nemons.db")

	// First open: the empty database bootstraps its operator token.
	s, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("first open of an empty database: %v", err)
	}
	token := s.OperatorToken()
	if token == "" {
		t.Fatal("the first run produced no operator token")
	}
	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	// Second open: idempotent — the same token, no regeneration.
	s2, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	if s2.OperatorToken() != token {
		t.Fatal("the operator token was regenerated — initialization is not idempotent")
	}
	t.Cleanup(func() { s2.Close() })
	h := NewHandler(s2, nil)
	h.dataDir = dir
	h.disableAgentProcesses = true
	return h, s2, token
}

func TestGovernanceBootstrap_FromEmptyDatabase(t *testing.T) {
	h, s, token := newBootstrapFixture(t)

	// 1+2. Initialize the system and establish the authorized operator — both
	// happened inside the double store open, with no manual DB edit, and the
	// token survived the restart idempotently.

	// 3. Create an approval request: the governed call itself opens the ask.
	bind := h.Handle(Request{Method: "governance_bind", Params: map[string]any{
		"agent": "claude", "project": "/w", "role": "reviewer", "_source_agent": "claude"}})
	if bind.Error == "" || !strings.Contains(bind.Error, "governance ask") {
		t.Fatalf("step 3: the governed call did not open an ask: %v", bind.Error)
	}
	key := askKeyFrom(t, bind.Error)

	// 4. Read the pending approval.
	a, err := s.ApprovalForKey(key)
	if err != nil || a == nil || a.Status != storage.ApprovalOpen {
		t.Fatalf("step 4: pending approval not readable: %v %+v", err, a)
	}

	// 5. Decide it (allow) through the operator token.
	resp := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": key, "decision": storage.ApprovalAllow, "decider": "operator",
		"operator_token": token, "_source_agent": "claude"}})
	if resp.Error != "" {
		t.Fatalf("step 5: decide refused: %v", resp.Error)
	}

	// 6. Execute the governed operation — the standing grant admits the packet.
	bind2 := h.Handle(Request{Method: "governance_bind", Params: map[string]any{
		"agent": "claude", "project": "/w", "role": "reviewer", "_source_agent": "claude"}})
	if bind2.Error != "" {
		t.Fatalf("step 6: governed operation refused after approval: %v", bind2.Error)
	}

	// 7. Verify the audit history: requested + decided (the operation's own
	// governance event rides the same snapshot).
	events, err := s.GovernanceSnapshot()
	if err != nil {
		t.Fatalf("step 7: audit read: %v", err)
	}
	if len(events) < 2 {
		t.Fatalf("step 7: audit events = %d, want the requested+decided trail", len(events))
	}

	// 8. Unauthorized approval attempt: no token, wrong token — both refuse.
	for name, tok := range map[string]any{"missing": nil, "wrong": "not-the-token"} {
		params := map[string]any{"key": key, "decision": storage.ApprovalDeny, "decider": "someone", "_source_agent": "claude"}
		if tok != nil {
			params["operator_token"] = tok
		}
		if r := h.Handle(Request{Method: "governance_decide", Params: params}); r.Error == "" || !strings.Contains(r.Error, "operator authorization") {
			t.Fatalf("step 8 (%s token): unauthorized decision accepted: %v", name, r.Error)
		}
	}

	// 9. Replay: the decided row refuses a second decision.
	if r := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": key, "decision": storage.ApprovalAllow, "decider": "operator",
		"operator_token": token, "_source_agent": "claude"}}); r.Error == "" || !strings.Contains(r.Error, "not open") {
		t.Fatalf("step 9: replay accepted: %v", r.Error)
	}

	// 10. Mismatched approval: a decision naming an unknown key refuses.
	if r := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": fmt.Sprintf("%x", []byte("nonexistent-key")), "decision": storage.ApprovalAllow, "decider": "operator",
		"operator_token": token, "_source_agent": "claude"}}); r.Error == "" {
		t.Fatal("step 10: a decision on an unknown key was accepted")
	}
}
