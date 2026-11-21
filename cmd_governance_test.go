package main

// The operator CLI's governance surface (remediation 02 WS-D4): authorized
// decisions land audited and idempotent, wrong tokens record nothing, the
// token persists across restarts, recovery rotates it explicitly, and no
// output surface ever carries the token.

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/storage"
)

func governanceTestStore(t *testing.T) (*storage.Store, string, string) {
	t.Helper()
	dir := t.TempDir()
	s, err := storage.Open(filepath.Join(dir, "nemons.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	key := "gate.test-method:/w/probe"
	if _, err := s.RequestApproval(key, "test_method", "agent-x", "agent", time.Hour*72); err != nil {
		t.Fatalf("request approval: %v", err)
	}
	return s, key, s.OperatorToken()
}

func TestGovernanceDecideAuthorizedAllowAndDeny(t *testing.T) {
	s, key, token := governanceTestStore(t)

	if err := governanceDecideCore(s, key, "allow", token); err != nil {
		t.Fatalf("authorized allow: %v", err)
	}
	a, err := s.ApprovalForKey(key)
	if err != nil || a.Decision != "allow" || a.Status != storage.ApprovalDecided {
		t.Fatalf("allow did not land: %+v %v", a, err)
	}

	// Idempotency: a second decision on the closed row is refused, not reapplied.
	if err := governanceDecideCore(s, key, "deny", token); err != storage.ErrApprovalNotOpen {
		t.Fatalf("a decided row accepted another decision: %v", err)
	}

	// A fresh ask, denied: the audit trail records both verdicts with the
	// operator decider.
	key2 := "gate.test-method:/w/probe-2"
	if _, err := s.RequestApproval(key2, "test_method", "agent-x", "agent", time.Hour*72); err != nil {
		t.Fatal(err)
	}
	if err := governanceDecideCore(s, key2, "deny", token); err != nil {
		t.Fatalf("authorized deny: %v", err)
	}
	events, err := s.GovernanceEvents(0)
	if err != nil {
		t.Fatal(err)
	}
	decided := 0
	for _, e := range events {
		if e.Kind == storage.EventApprovalDecided && strings.Contains(e.Detail, "by operator:cli") {
			decided++
		}
	}
	if decided != 2 {
		t.Fatalf("audit trail holds %d operator decisions, want 2", decided)
	}
}

func TestGovernanceDecideInvalidTokenRecordsNothing(t *testing.T) {
	s, key, token := governanceTestStore(t)
	for _, bad := range []string{"", "not-the-token", token + "x"} {
		if err := governanceDecideCore(s, key, "allow", bad); err == nil || !strings.Contains(err.Error(), "invalid operator token") {
			t.Fatalf("token %q was accepted: %v", bad, err)
		}
	}
	a, err := s.ApprovalForKey(key)
	if err != nil || a.Status != storage.ApprovalOpen {
		t.Fatalf("a refused token mutated state: %+v %v", a, err)
	}
	// The error never names the correct token.
	err = governanceDecideCore(s, key, "allow", "wrong")
	if strings.Contains(err.Error(), token) {
		t.Fatal("the refusal leaked the token")
	}
}

func TestGovernanceTokenPersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "nemons.db")
	s1, err := storage.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	token := s1.OperatorToken()
	s1.Close()

	s2, err := storage.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if s2.OperatorToken() != token {
		t.Fatal("the operator token was regenerated on restart instead of persisting")
	}
	if !s2.OperatorTokenOK(token) {
		t.Fatal("the persisted token no longer authenticates after restart")
	}
}

func TestGovernanceRecoveryRotation(t *testing.T) {
	s, _, old := governanceTestStore(t)

	// Recovery for a lost token: an explicit rotation invalidates the old
	// token immediately and the new one works.
	fresh, err := s.RotateOperatorToken()
	if err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if fresh == old {
		t.Fatal("rotation produced the same token")
	}
	if s.OperatorTokenOK(old) {
		t.Fatal("the rotated-out token still authenticates")
	}
	if !s.OperatorTokenOK(fresh) {
		t.Fatal("the rotated-in token does not authenticate")
	}
	// The rotation is audited.
	events, err := s.GovernanceEvents(0)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range events {
		if strings.Contains(e.Kind, "operator_token_rotated") {
			found = true
		}
	}
	if !found {
		t.Fatal("the rotation left no audit event")
	}
	// And an agent-supplied token argument can never rotate: the daemon's
	// decide surface has no rotation parameter at all — this is the CLI's act.
	key := "gate.test-method:/w/post-rotate"
	if _, err := s.RequestApproval(key, "test_method", "agent-x", "agent", time.Hour*72); err != nil {
		t.Fatal(err)
	}
	if err := governanceDecideCore(s, key, "allow", fresh); err != nil {
		t.Fatalf("the operator cannot decide after recovery: %v", err)
	}
}

func TestGovernanceNoTokenLeakageOnStorageSurfaces(t *testing.T) {
	s, key, token := governanceTestStore(t)
	_ = key
	// The storage read surfaces: pending list and audit trail never carry it.
	pending, err := s.PendingApprovals()
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range pending {
		if strings.Contains(a.Key+a.Method+a.Caller+a.Surface, token) {
			t.Fatal("the pending list leaked the token")
		}
	}
	events, err := s.GovernanceEvents(0)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range events {
		if strings.Contains(e.Kind+e.Key+e.Detail, token) {
			t.Fatal("the audit trail leaked the token")
		}
	}
}

func TestGovernancePendingListAndShow(t *testing.T) {
	s, key, _ := governanceTestStore(t)
	pending, err := s.PendingApprovals()
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0].Key != key || pending[0].Status != storage.ApprovalOpen {
		t.Fatalf("pending list = %+v, want exactly the one open ask", pending)
	}
	a, err := s.ApprovalForKey(key)
	if err != nil || a == nil || a.Method != "test_method" {
		t.Fatalf("show: %+v %v", a, err)
	}
}
