package daemon

// The binding wired into Handle: a bound agent's foreign claim is refused
// before the handler touches a row, on every path that takes a project
// claim. The bind op itself is governed and lands with its audit event.

import (
	"strings"
	"testing"
	"time"

	"github.com/carsteneu/yesmem/internal/models"
)

func bindViaOp(t *testing.T, h *Handler, agent, project string) {
	t.Helper()
	first := h.Handle(Request{Method: "governance_bind", Params: map[string]any{
		"agent": agent, "project": project, "_source_agent": "operator"}})
	if first.Error == "" || !strings.Contains(first.Error, "governance ask") {
		t.Fatalf("expected the governed bind ask, got %q", first.Error)
	}
	key := strings.Fields(first.Error)[2]
	if err := h.store.DecideApproval(key, "allow", "operator"); err != nil {
		t.Fatalf("admit the bind: %v", err)
	}
	resp := h.Handle(Request{Method: "governance_bind", Params: map[string]any{
		"agent": agent, "project": project, "_source_agent": "operator"}})
	if resp.Error != "" {
		t.Fatalf("governance_bind: %v", resp.Error)
	}
}

func TestBindOpGatedThenLands(t *testing.T) {
	h, s := mustHandler(t)
	bindViaOp(t, h, "codex", "/srv/demo")
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "binding.upsert" {
			found = true
		}
	}
	if !found {
		t.Error("no binding.upsert event in the trail")
	}
}

func TestBoundAgentForeignClaimRefusedBeforeRows(t *testing.T) {
	h, s := mustHandler(t)
	bindViaOp(t, h, "codex", "/srv/demo")
	// The store holds rows under the OTHER project; the bound agent cannot
	// even read them.
	if _, err := s.InsertLearning(&models.Learning{Category: "gotcha", Content: "claude's note", Project: "/srv/other", CreatedAt: time.Now(), ModelUsed: "test"}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	resp := h.Handle(Request{Method: "get_learnings", Params: map[string]any{
		"project": "/srv/other", "_source_agent": "codex"}})
	if resp.Error == "" {
		t.Fatal("the bound agent read the foreign project")
	}
	if !strings.Contains(resp.Error, "is bound to") {
		t.Errorf("refusal %q does not name the binding", resp.Error)
	}
	rows, _ := s.GetActiveLearnings("", "/srv/other", "", "", 10)
	if len(rows) != 1 {
		t.Errorf("foreign rows = %d, want 1: nothing was touched by the refusal", len(rows))
	}
}

func TestBoundAgentSameClaimPasses(t *testing.T) {
	h, _ := mustHandler(t)
	bindViaOp(t, h, "codex", "/srv/demo")
	resp := h.Handle(Request{Method: "get_learnings", Params: map[string]any{
		"project": "/srv/demo", "_source_agent": "codex"}})
	if resp.Error != "" {
		t.Fatalf("same-project read refused: %v", resp.Error)
	}
}

func TestUnboundCallerKeepsBaseBehaviour(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "get_learnings", Params: map[string]any{
		"project": "/srv/anywhere", "_source_agent": "claude"}})
	if resp.Error != "" {
		t.Fatalf("unbound caller refused: %v", resp.Error)
	}
}

func TestBrokenBindingClosesTheCall(t *testing.T) {
	h, _ := mustHandler(t)
	h.store.Close()
	resp := h.Handle(Request{Method: "get_learnings", Params: map[string]any{
		"project": "/srv/demo", "_source_agent": "codex"}})
	if resp.Error == "" {
		t.Fatal("a broken binding lookup passed: fail closed")
	}
}
