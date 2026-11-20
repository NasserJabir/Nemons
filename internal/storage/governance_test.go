package storage

// The governance approval lifecycle, its idempotence, and its audit trail.
// Every state change the store applies to an approval row writes its own event
// in the same transaction as the row, so the trail can be replayed as the
// record of what happened.

import (
	"errors"
	"testing"
	"time"
)

func mustKey(t *testing.T, s string) string {
	t.Helper()
	if s == "" {
		t.Fatal("seed key must not be empty")
	}
	return s
}

func TestGovernanceRequestApprovalOpensOneRow(t *testing.T) {
	s := mustOpen(t)
	id, err := s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err != nil {
		t.Fatalf("RequestApproval: %v", err)
	}
	a, err := s.ApprovalForKey("abcd1234")
	if err != nil || a == nil {
		t.Fatalf("ApprovalForKey: %v, %v", a, err)
	}
	if a.ID != id || a.Status != ApprovalOpen || a.Method != "remember" || a.Surface != "agent" {
		t.Errorf("row = %+v, want the open remember ask on the agent surface", a)
	}
}

func TestGovernanceAskIsIdempotentPerKey(t *testing.T) {
	s := mustOpen(t)
	first, err := s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err != nil {
		t.Fatalf("first ask: %v", err)
	}
	second, err := s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err != nil {
		t.Fatalf("second ask: %v", err)
	}
	if first != second {
		t.Errorf("asks returned %d then %d, want the same open row", first, second)
	}
	n, err := s.OpenApprovalCount()
	if err != nil || n != 1 {
		t.Errorf("open count = %d (%v), want 1: a retried ask stacks no rows", n, err)
	}
}

func TestGovernanceRequestedEventWrittenOncePerKey(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	_, _ = s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	events, err := s.GovernanceSnapshot()
	if err != nil {
		t.Fatalf("GovernanceSnapshot: %v", err)
	}
	kind := 0
	for _, e := range events {
		if e.Kind == EventApprovalRequested && e.Key == "abcd1234" {
			kind++
		}
	}
	if kind != 1 {
		t.Errorf("approval.requested events for the key = %d, want 1", kind)
	}
}

func TestGovernanceDecideClosesTheOpenRow(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval("abcd1234", ApprovalAllow, "operator"); err != nil {
		t.Fatalf("DecideApproval: %v", err)
	}
	a, _ := s.ApprovalForKey("abcd1234")
	if a.Status != ApprovalDecided || a.Decision != ApprovalAllow {
		t.Errorf("row = %+v, want a decided allow", a)
	}
	if a.DecidedAt == "" {
		t.Error("decided_at is empty: the close carries its own instant")
	}
}

func TestGovernanceDecideRefusedAfterTheRowClosed(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval("abcd1234", ApprovalAllow, "operator"); err != nil {
		t.Fatalf("first decide: %v", err)
	}
	if err := s.DecideApproval("abcd1234", ApprovalDeny, "operator"); !errors.Is(err, ErrApprovalNotOpen) {
		t.Errorf("second decide err = %v, want ErrApprovalNotOpen", err)
	}
}

func TestGovernanceDecideRefusedForUnknownKey(t *testing.T) {
	s := mustOpen(t)
	if err := s.DecideApproval("deadbeef", ApprovalAllow, "operator"); !errors.Is(err, ErrApprovalUnknown) {
		t.Errorf("err = %v, want ErrApprovalUnknown", err)
	}
}

func TestGovernanceDecisionMustBeAllowOrDeny(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval("abcd1234", "maybe", "operator"); err == nil {
		t.Fatal("a free-text decision was accepted")
	}
}

func TestGovernanceDecidedEventCarriesTheDecider(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval("abcd1234", ApprovalDeny, "nasser"); err != nil {
		t.Fatalf("DecideApproval: %v", err)
	}
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == EventApprovalDecided {
			found = true
			if e.ApprovalID == 0 || e.Key != "abcd1234" {
				t.Errorf("event = %+v, want the approval id and key on it", e)
			}
			if e.Detail != "deny by nasser" {
				t.Errorf("detail = %q, want the decision and the decider", e.Detail)
			}
		}
	}
	if !found {
		t.Fatal("no approval.decided event in the trail")
	}
}

func TestGovernanceDifferentKeysGetTheirOwnRows(t *testing.T) {
	s := mustOpen(t)
	for _, key := range []string{"aaaa1111", "bbbb2222", "cccc3333"} {
		if _, err := s.RequestApproval(key, "remember", "claude", "agent", time.Minute); err != nil {
			t.Fatalf("ask %s: %v", key, err)
		}
	}
	n, _ := s.OpenApprovalCount()
	if n != 3 {
		t.Errorf("open count = %d, want 3", n)
	}
}

func TestGovernanceOpenCountExcludesClosedRows(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", time.Minute)
	_, _ = s.RequestApproval("bbbb2222", "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval("aaaa1111", ApprovalAllow, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	n, _ := s.OpenApprovalCount()
	if n != 1 {
		t.Errorf("open count = %d, want 1 after one decide", n)
	}
}

func TestGovernanceEmptyKeyOrMethodRefused(t *testing.T) {
	s := mustOpen(t)
	if _, err := s.RequestApproval("", "remember", "claude", "agent", time.Minute); err == nil {
		t.Fatal("an empty key was accepted")
	}
	if _, err := s.RequestApproval("abcd1234", "", "claude", "agent", time.Minute); err == nil {
		t.Fatal("an empty method was accepted")
	}
}

func TestGovernanceUnknownKeyReadsAsAbsent(t *testing.T) {
	s := mustOpen(t)
	a, err := s.ApprovalForKey("deadbeef")
	if err != nil {
		t.Fatalf("ApprovalForKey: %v", err)
	}
	if a != nil {
		t.Errorf("row = %+v, want nil for a key the store never saw", a)
	}
}

func TestGovernanceEventsOrderedNewestLast(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", time.Minute)
	_, _ = s.RequestApproval("bbbb2222", "save_cap", "codex", "agent", time.Minute)
	events, _ := s.GovernanceSnapshot()
	if len(events) != 2 {
		t.Fatalf("events = %d, want 2", len(events))
	}
	if events[0].ID >= events[1].ID {
		t.Errorf("ids %d then %d: the trail is not ordered by insertion", events[0].ID, events[1].ID)
	}
	if events[1].Detail != "save_cap on agent" {
		t.Errorf("detail = %q, want the method and surface", events[1].Detail)
	}
}

func TestGovernanceEventsLimitTruncates(t *testing.T) {
	s := mustOpen(t)
	for _, key := range []string{"aaaa1111", "bbbb2222", "cccc3333"} {
		_, _ = s.RequestApproval(key, "remember", "claude", "agent", time.Minute)
	}
	events, err := s.GovernanceEvents(2)
	if err != nil {
		t.Fatalf("GovernanceEvents(2): %v", err)
	}
	if len(events) != 2 {
		t.Errorf("events = %d, want the first 2", len(events))
	}
}

func TestGovernanceSurfaceDefaultsToAgent(t *testing.T) {
	s := mustOpen(t)
	if _, err := s.RequestApproval("abcd1234", "remember", "claude", "", time.Minute); err != nil {
		t.Fatalf("RequestApproval: %v", err)
	}
	a, _ := s.ApprovalForKey("abcd1234")
	if a.Surface != "agent" {
		t.Errorf("surface = %q, want the agent default", a.Surface)
	}
}

func TestGovernanceSnapshotMatchesTheTrail(t *testing.T) {
	s := mustOpen(t)
	_, _ = s.RequestApproval("aaaa1111", "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval("aaaa1111", ApprovalAllow, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	snap, _ := s.GovernanceSnapshot()
	trail, _ := s.GovernanceEvents(0)
	if len(snap) != len(trail) {
		t.Errorf("snapshot = %d events, trail = %d: they read the same rows", len(snap), len(trail))
	}
}
