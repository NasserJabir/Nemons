package daemon

// The gate wired into Handle: a governed call asks before it runs, the ask is
// idempotent per packet, an approved packet proceeds, a denied one is refused.
// The decide surface is NOT governed by the gate (WS-F): the decision
// authority stands outside the gate it operates, authenticated by the operator
// token instead. These tests drive the wiring through Handle exactly as a
// caller would.

import (
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/storage"
)

// governanceBindParams is one fixed governed packet used across the gate tests.
func governanceBindParams() map[string]any {
	return map[string]any{
		"agent": "claude", "project": "/w", "role": "reviewer", "_source_agent": "claude", "_source_agent_source": "resolved",
	}
}

func TestGateWiredBeforeDispatch_UngovernedPasses(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.Handle(Request{Method: "get_learnings", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved","project": "/w"}})
	if resp.Error != "" {
		t.Fatalf("ungoverned read refused: %v", resp.Error)
	}
	if events, _ := s.GovernanceSnapshot(); len(events) != 0 {
		t.Errorf("the ungoverned path wrote %d governance events", len(events))
	}
}

func TestGateGovernedCallAsksFirst(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if resp.Error == "" {
		t.Fatal("a governed write ran without an approval")
	}
	if !strings.Contains(resp.Error, "governance ask") {
		t.Errorf("refusal %q does not name the ask", resp.Error)
	}
	key := storage.GateKey("governance_bind", governanceBindParams())
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
	_ = h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	_ = h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
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
	first := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if first.Error == "" || !strings.Contains(first.Error, "governance ask") {
		t.Fatalf("expected the governed ask, got %q", first.Error)
	}
	// The operator closes the ask with the decision authority: authenticated,
	// audited, and not gated by its own packet — the bootstrap cycle is gone.
	resp := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": askKeyFrom(t, first.Error), "decision": storage.ApprovalAllow, "decider": "operator",
		"operator_token": s.OperatorToken(), "_source_agent": "claude", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("operator decide refused: %v", resp.Error)
	}
	second := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if second.Error != "" {
		t.Fatalf("approved governed call refused: %v", second.Error)
	}
	key := storage.GateKey("governance_bind", governanceBindParams())
	a, _ := s.ApprovalForKey(key)
	if a.Decision != storage.ApprovalAllow || a.Status != storage.ApprovalDecided {
		t.Errorf("approval row = %+v, want the operator's allow applied", a)
	}
}

func TestGateDeniedPacketRefused(t *testing.T) {
	h, s := mustHandler(t)
	first := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if first.Error == "" || !strings.Contains(first.Error, "governance ask") {
		t.Fatalf("expected the governed ask, got %q", first.Error)
	}
	if resp := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": askKeyFrom(t, first.Error), "decision": storage.ApprovalDeny, "decider": "operator",
		"operator_token": s.OperatorToken(), "_source_agent": "claude", "_source_agent_source": "resolved"}}); resp.Error != "" {
		t.Fatalf("operator deny refused: %v", resp.Error)
	}
	resp := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if resp.Error == "" {
		t.Fatal("a denied call ran")
	}
	if !strings.Contains(resp.Error, "governance refused") {
		t.Errorf("refusal %q does not name the governance refusal", resp.Error)
	}
}

func TestGateOpenAskStillBlocksResends(t *testing.T) {
	h, _ := mustHandler(t)
	_ = h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	resp := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if resp.Error == "" || !strings.Contains(resp.Error, "is open for") {
		t.Errorf("resend response = %q, want the open-ask wait", resp.Error)
	}
}

func TestGateDenySurvivesExpiryWindow(t *testing.T) {
	h, s := mustHandler(t)
	first := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if first.Error == "" {
		t.Fatal("expected the governed ask")
	}
	if resp := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": askKeyFrom(t, first.Error), "decision": storage.ApprovalDeny, "decider": "operator",
		"operator_token": s.OperatorToken(), "_source_agent": "claude", "_source_agent_source": "resolved"}}); resp.Error != "" {
		t.Fatalf("operator deny refused: %v", resp.Error)
	}
	// The deny decision stands regardless of the ask's expiry clock: the row is
	// closed, not aged out.
	key := storage.GateKey("governance_bind", governanceBindParams())
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
	resp := h.gateRequest(Request{Method: "governance_bind", Params: nil})
	if resp != nil {
		t.Errorf("nil-store gate returned %v, want the fold-open nil", resp)
	}
}

// The decision authority is never model-controlled: without the operator token
// the decide surface refuses, whatever the packet claims.
func TestOperatorTokenGatesDecide(t *testing.T) {
	h, s := mustHandler(t)
	seed := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	if seed.Error == "" {
		t.Fatal("expected the governed ask")
	}
	for name, token := range map[string]any{
		"missing":    nil,
		"empty":      "",
		"fabricated": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	} {
		params := map[string]any{
			"key": askKeyFrom(t, seed.Error), "decision": storage.ApprovalAllow, "decider": "operator",
			"_source_agent": "claude", "_source_agent_source": "resolved",
		}
		if token != nil {
			params["operator_token"] = token
		}
		resp := h.Handle(Request{Method: "governance_decide", Params: params})
		if resp.Error == "" || !strings.Contains(resp.Error, "operator authorization") {
			t.Fatalf("%s token was accepted: %v", name, resp.Error)
		}
	}
	// And with the real token the same packet decides.
	if resp := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": askKeyFrom(t, seed.Error), "decision": storage.ApprovalAllow, "decider": "operator",
		"operator_token": s.OperatorToken(), "_source_agent": "claude", "_source_agent_source": "resolved"}}); resp.Error != "" {
		t.Fatalf("operator decide refused with the real token: %v", resp.Error)
	}
}

// Replay: a decided ask refuses a second decision instead of being re-applied.
func TestGovernanceReplayRefused(t *testing.T) {
	h, s := mustHandler(t)
	seed := h.Handle(Request{Method: "governance_bind", Params: governanceBindParams()})
	decide := map[string]any{
		"key": askKeyFrom(t, seed.Error), "decision": storage.ApprovalAllow, "decider": "operator",
		"operator_token": s.OperatorToken(), "_source_agent": "claude", "_source_agent_source": "resolved",
	}
	if resp := h.Handle(Request{Method: "governance_decide", Params: decide}); resp.Error != "" {
		t.Fatalf("first decide refused: %v", resp.Error)
	}
	resp := h.Handle(Request{Method: "governance_decide", Params: decide})
	if resp.Error == "" {
		t.Fatal("a replayed decision was accepted")
	}
	if !strings.Contains(resp.Error, "not open") {
		t.Errorf("replay refusal %q does not name the closed row", resp.Error)
	}
}

func mustParse(s string) time.Time {
	p, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Now().Add(time.Hour)
	}
	return p
}
// askKeyFrom extracts the packet key the gate names in its ask refusal
// ("governance ask <key> is open for <method>: ...").
func askKeyFrom(t *testing.T, ask string) string {
	t.Helper()
	fields := strings.Fields(ask)
	if len(fields) < 3 {
		t.Fatalf("unexpected ask refusal format: %q", ask)
	}
	return fields[2]
}
