package storage

// The gate is a pure reader: its decisions come from the rows on disk, its key
// comes from the packet itself, and evaluating never writes a row. The tests
// pin the key derivation, the registry, and every decision arm.

import (
	"strings"
	"testing"
	"time"
)

func TestGateKeyIsThePacketDigest(t *testing.T) {
	key := GateKey("governance_decide", map[string]any{"project": "/w", "content": "hi"})
	if len(key) != 8 {
		t.Fatalf("key = %q, want 8 hex characters", key)
	}
	for _, r := range key {
		if !strings.ContainsRune("0123456789abcdef", r) {
			t.Fatalf("key %q is not hex", key)
		}
	}
}

func TestGateKeyIsStableForTheSamePacket(t *testing.T) {
	a := GateKey("governance_decide", map[string]any{"content": "hi", "project": "/w"})
	b := GateKey("governance_decide", map[string]any{"project": "/w", "content": "hi"})
	if a != b {
		t.Errorf("keys %q and %q differ: map order moved the digest", a, b)
	}
}

func TestGateKeyMovesWithAnyParameter(t *testing.T) {
	base := GateKey("governance_decide", map[string]any{"content": "hi"})
	other := GateKey("governance_decide", map[string]any{"content": "hi!", "x": 1})
	if base == other {
		t.Error("a different packet hashed to the same ask")
	}
	if GateKey("governance_decide", nil) == GateKey("save_cap", nil) {
		t.Error("the method did not separate the packets")
	}
}

func TestGateRegistryHoldsTheGovernedMethods(t *testing.T) {
	ms := GovernedMethods()
	if len(ms) == 0 {
		t.Fatal("the governed registry is empty")
	}
	if !IsGovernedMethod("governance_decide") {
		t.Error("the governance op itself is not governed")
	}
	for _, m := range []string{"remember", "save_cap", "get_learnings", "broadcast"} {
		if IsGovernedMethod(m) {
			t.Errorf("%s is governed: upstream memory ops keep their own behaviour", m)
		}
	}
}

func TestGateEvaluateNeverWrites(t *testing.T) {
	s := mustOpen(t)
	before, _ := s.OpenApprovalCount()
	d := s.EvaluateGovernance("governance_decide", "claude", "agent", map[string]any{"content": "hi"})
	after, _ := s.OpenApprovalCount()
	if d.Action != GateAsk {
		t.Fatalf("action = %q, want ask for a packet with no approval", d.Action)
	}
	if before != after {
		t.Errorf("open count moved %d -> %d: the evaluator opened a row", before, after)
	}
	if events, _ := s.GovernanceSnapshot(); len(events) != 0 {
		t.Errorf("the evaluator wrote %d events; it must stay a pure read", len(events))
	}
}

func TestGateOpenRowStillAsks(t *testing.T) {
	s := mustOpen(t)
	id, _ := s.RequestApproval(GateKey("governance_decide", nil), "remember", "claude", "agent", time.Minute)
	d := s.EvaluateGovernance("governance_decide", "claude", "agent", nil)
	if d.Action != GateAsk || d.ApprovalID != id {
		t.Errorf("decision = %+v, want ask naming the open row %d", d, id)
	}
}

func TestGateDenyDecisionRefuses(t *testing.T) {
	s := mustOpen(t)
	key := GateKey("governance_decide", nil)
	_, _ = s.RequestApproval(key, "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval(key, ApprovalDeny, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	d := s.EvaluateGovernance("governance_decide", "claude", "agent", nil)
	if d.Action != GateDeny {
		t.Errorf("action = %q, want deny after a deny decision", d.Action)
	}
}

func TestGateAllowDecisionIsTheStandingGrant(t *testing.T) {
	s := mustOpen(t)
	key := GateKey("governance_decide", nil)
	_, _ = s.RequestApproval(key, "remember", "claude", "agent", time.Minute)
	if err := s.DecideApproval(key, ApprovalAllow, "operator"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	d := s.EvaluateGovernance("governance_decide", "claude", "agent", nil)
	if d.Action != GateAllow {
		t.Errorf("action = %q, want allow from the standing grant", d.Action)
	}
	if d.Key != key {
		t.Errorf("decision key = %q, want the packet key %q", d.Key, key)
	}
}

func TestGateUngovernedMethodPassesUntouched(t *testing.T) {
	s := mustOpen(t)
	d := s.EvaluateGovernance("get_learnings", "claude", "agent", nil)
	if d.Action != GateAllow {
		t.Errorf("action = %q, want allow for an ungoverned read", d.Action)
	}
}

func TestGateReadFailureClosesTheCall(t *testing.T) {
	s := mustOpen(t)
	s.Close()
	d := s.EvaluateGovernance("governance_decide", "claude", "agent", nil)
	if d.Action != GateDeny {
		t.Errorf("action = %q, want deny when the governance read fails: fail closed", d.Action)
	}
}
