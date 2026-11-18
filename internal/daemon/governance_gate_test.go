package daemon

// The gate wired into Handle: a governed call asks before it runs, the ask is
// idempotent per packet, an approved packet proceeds, a denied one is refused,
// and an ungoverned method passes untouched. These tests drive the gate
// through Handle exactly as a caller would.

import (
	"strings"
	"testing"
	"time"

	"github.com/carsteneu/yesmem/internal/storage"
)

func TestGateWiredBeforeDispatch_UngovernedPasses(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.Handle(Request{Method: "get_learnings", Params: map[string]any{"project": "/w"}})
	if resp.Error != "" {
		t.Fatalf("ungoverned read refused: %v", resp.Error)
	}
	if events, _ := s.GovernanceSnapshot(); len(events) != 0 {
		t.Errorf("the ungoverned path wrote %d governance events", len(events))
	}
}

func TestGateGovernedCallAsksFirst(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "gated write", "project": "/w", "_source_agent": "claude"}})
	if resp.Error == "" {
		t.Fatal("a governed write ran without an approval")
	}
	if !strings.Contains(resp.Error, "governance ask") {
		t.Errorf("refusal %q does not name the ask", resp.Error)
	}
	key := storage.GateKey("remember", map[string]any{
		"text": "gated write", "project": "/w", "_source_agent": "claude"})
	a, _ := s.ApprovalForKey(key)
	if a == nil || a.Status != storage.ApprovalOpen {
		t.Errorf("approval = %+v, want the open ask the wiring opened", a)
	}
	if events, _ := s.GovernanceSnapshot(); len(events) != 1 {
		t.Errorf("events = %d, want exactly the approval.requested line", len(events))
	}
}

func TestGateAskIsIdempotentPerPacket(t *testing.T) {
	h, s := mustHandler(t)
	params := map[string]any{"text": "gated write", "project": "/w", "_source_agent": "claude"}
	_ = h.Handle(Request{Method: "remember", Params: params})
	_ = h.Handle(Request{Method: "remember", Params: params})
	n, _ := s.OpenApprovalCount()
	if n != 1 {
		t.Errorf("open asks = %d, want 1: the resend did not stack a second ask", n)
	}
	if events, _ := s.GovernanceSnapshot(); len(events) != 1 {
		t.Errorf("events = %d, want one approval.requested for both calls", len(events))
	}
}

func TestGateApprovedPacketProceeds(t *testing.T) {
	h, s := mustHandler(t)
	params := map[string]any{"text": "approved write", "project": "/w", "_source_agent": "claude"}
	_ = h.Handle(Request{Method: "remember", Params: params})
	key := storage.GateKey("remember", params)
	if err := s.DecideApproval(key, storage.ApprovalAllow, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	resp := h.Handle(Request{Method: "remember", Params: params})
	if resp.Error != "" {
		t.Fatalf("approved call refused: %v", resp.Error)
	}
	ls, err := s.GetActiveLearnings("explicit_teaching", "/w", "", "", 10)
	if err != nil || len(ls) == 0 {
		t.Errorf("learnings = %d (%v), want the approved row stored", len(ls), err)
	}
}

func TestGateDeniedPacketRefused(t *testing.T) {
	h, s := mustHandler(t)
	params := map[string]any{"text": "denied write", "project": "/w", "_source_agent": "claude"}
	_ = h.Handle(Request{Method: "remember", Params: params})
	key := storage.GateKey("remember", params)
	if err := s.DecideApproval(key, storage.ApprovalDeny, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	resp := h.Handle(Request{Method: "remember", Params: params})
	if resp.Error == "" {
		t.Fatal("a denied call ran")
	}
	if !strings.Contains(resp.Error, "governance refused") {
		t.Errorf("refusal %q does not name the governance refusal", resp.Error)
	}
}

func TestGateOpenAskStillBlocksResends(t *testing.T) {
	h, _ := mustHandler(t)
	params := map[string]any{"text": "waiting write", "project": "/w", "_source_agent": "claude"}
	_ = h.Handle(Request{Method: "remember", Params: params})
	resp := h.Handle(Request{Method: "remember", Params: params})
	if resp.Error == "" || !strings.Contains(resp.Error, "is open for") {
		t.Errorf("resend response = %q, want the open-ask wait", resp.Error)
	}
}

func TestGateDenySurvivesExpiryWindow(t *testing.T) {
	h, s := mustHandler(t)
	params := map[string]any{"text": "denied and aged", "project": "/w", "_source_agent": "claude"}
	_ = h.Handle(Request{Method: "remember", Params: params})
	key := storage.GateKey("remember", params)
	if err := s.DecideApproval(key, storage.ApprovalDeny, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	// The deny decision stands regardless of the ask's expiry clock: the row is
	// closed, not aged out.
	a, _ := s.ApprovalForKey(key)
	if a.Status != storage.ApprovalDecided {
		t.Errorf("status = %q, want decided", a.Status)
	}
	if time.Until(mustParse(a.DecidedAt)) > 0 {
		t.Error("decided_at is in the future")
	}
}

func TestGateNilStoreFoldsOpen(t *testing.T) {
	h := &Handler{}
	resp := h.gateRequest(Request{Method: "remember", Params: nil})
	if resp != nil {
		t.Errorf("nil-store gate returned %v, want the fold-open nil", resp)
	}
}

func mustParse(t string) time.Time {
	p, err := time.Parse(time.RFC3339, t)
	if err != nil {
		return time.Now().Add(time.Hour)
	}
	return p
}
