package storage

// The expiry arm of the approval lifecycle: an ask nobody decides ends with
// its own audit event, written in the same transaction that closes the row.

import (
	"strings"
	"testing"
	"time"
)

func TestApprovalsExpier(t *testing.T) {
	s := mustOpen(t)
	id, err := s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err != nil {
		t.Fatalf("RequestApproval: %v", err)
	}
	// One event so far: the ask itself.
	events, _ := s.GovernanceSnapshot()
	if len(events) != 1 || events[0].Kind != EventApprovalRequested {
		t.Fatalf("events = %+v, want the single approval.requested line", events)
	}

	closed, err := s.ExpireStaleApprovals(time.Now().Add(2 * time.Minute))
	if err != nil {
		t.Fatalf("ExpireStaleApprovals: %v", err)
	}
	if closed != 1 {
		t.Errorf("closed = %d, want 1", closed)
	}
	a, _ := s.ApprovalForKey("abcd1234")
	if a.Status != ApprovalExpired {
		t.Errorf("status = %q, want expired", a.Status)
	}

	events, _ = s.GovernanceSnapshot()
	if len(events) != 2 {
		t.Fatalf("events = %d, want 2: the ask and its own expiry event", len(events))
	}
	exp := events[1]
	if exp.Kind != EventApprovalExpired {
		t.Errorf("event kind = %q, want approval.expired", exp.Kind)
	}
	// The expiry event names the row it closed: the audit line carries the
	// approval's own id and key.
	if exp.ApprovalID != id || exp.Key != "abcd1234" {
		t.Errorf("event = %+v, want approval id %d and key abcd1234", exp, id)
	}
}

func TestApprovalExpirySkipsDecidedRows(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval("aaaa1111", ApprovalAllow, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	closed, err := s.ExpireStaleApprovals(time.Now().Add(2 * time.Minute))
	if err != nil {
		t.Fatalf("ExpireStaleApprovals: %v", err)
	}
	if closed != 0 {
		t.Errorf("closed = %d, want 0: a decided row is not the sweep's to close", closed)
	}
	a, _ := s.ApprovalForKey("aaaa1111")
	if a.Status != ApprovalDecided {
		t.Errorf("status = %q, want the decision preserved", a.Status)
	}
}

func TestApprovalExpirySkipsARowDecidedBetweenReadAndWrite(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", -time.Minute) // already due
	if err := s.DecideApproval("aaaa1111", ApprovalAllow, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	closed, _ := s.ExpireStaleApprovals(time.Now())
	if closed != 0 {
		t.Errorf("closed = %d, want 0: the decision wrote its own event first", closed)
	}
	events, _ := s.GovernanceSnapshot()
	for _, e := range events {
		if e.Kind == EventApprovalExpired {
			t.Errorf("the trail gained an expiry event %+v for a decided row", e)
		}
	}
}

func TestApprovalExpiryClosesOnlyDueRows(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", time.Minute)  // still fresh
	_, _ = s.RequestApproval("bbbb2222", "save_cap", "codex", "agent", -time.Second) // due
	closed, err := s.ExpireStaleApprovals(time.Now())
	if err != nil {
		t.Fatalf("ExpireStaleApprovals: %v", err)
	}
	if closed != 1 {
		t.Errorf("closed = %d, want only the due row", closed)
	}
	fresh, _ := s.ApprovalForKey("aaaa1111")
	if fresh.Status != ApprovalOpen {
		t.Errorf("fresh ask status = %q, want open", fresh.Status)
	}
}

func TestApprovalExpiryEventCountsInTheSnapshot(t *testing.T) {
	s := mustOpen(t)
	// The measured seed: two asks, one decided, one expired, and a second ask
	// decided after its twin's expiry — eight events end to end.
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", time.Minute)      // 1 requested
	_, _ = s.RequestApproval("bbbb2222", "remember", "codex", "agent", -time.Second)      // 2 requested
	_, _ = s.RequestApproval("cccc3333", "save_cap", "claude", "agent", -time.Second)     // 3 requested
	if _, err := s.ExpireStaleApprovals(time.Now()); err != nil {                          // 4+5 expired ×2
		t.Fatalf("expire: %v", err)
	}
	if err := s.DecideApproval("aaaa1111", ApprovalAllow, "operator"); err != nil {        // 6 decided
		t.Fatalf("decide: %v", err)
	}
	_, _ = s.RequestApproval("dddd4444", "broadcast", "codex", "agent", time.Minute)       // 7 requested
	if err := s.DecideApproval("dddd4444", ApprovalDeny, "operator"); err != nil {         // 8 decided
		t.Fatalf("decide: %v", err)
	}
	events, err := s.GovernanceSnapshot()
	if err != nil {
		t.Fatalf("GovernanceSnapshot: %v", err)
	}
	if len(events) != 8 {
		t.Fatalf("snapshot = %d events, want 8 in the measured seed", len(events))
	}
	kinds := ""
	for _, e := range events {
		kinds += e.Kind + ","
	}
	for _, want := range []string{EventApprovalRequested, EventApprovalExpired, EventApprovalDecided} {
		if !strings.Contains(kinds, want) {
			t.Errorf("trail %q lacks %s", kinds, want)
		}
	}
}

func TestApprovalExpiryIsIdempotent(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", -time.Second)
	if _, err := s.ExpireStaleApprovals(time.Now()); err != nil {
		t.Fatalf("first sweep: %v", err)
	}
	second, err := s.ExpireStaleApprovals(time.Now())
	if err != nil {
		t.Fatalf("second sweep: %v", err)
	}
	if second != 0 {
		t.Errorf("second sweep closed %d, want 0: an expired row is not revisited", second)
	}
	events, _ := s.GovernanceSnapshot()
	if len(events) != 2 {
		t.Errorf("events = %d, want the ask and one expiry event", len(events))
	}
}
