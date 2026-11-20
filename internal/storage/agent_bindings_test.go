package storage

// The binding lifecycle and the E3b claim rejection: a bound agent works
// inside its project, a claim for another project is refused with the binding
// named before any row is touched, an unbound caller passes, and a lookup
// that fails closes the call.

import (
	"strings"
	"testing"
)

func bindSeed(t *testing.T, s *Store, agent, project string) {
	t.Helper()
	if err := s.BindAgent(agent, project); err != nil {
		t.Fatalf("BindAgent(%s, %s): %v", agent, project, err)
	}
}

func TestBindingRoundTrip(t *testing.T) {
	s := mustOpen(t)
	bindSeed(t, s, "codex", "/srv/demo")
	b, err := s.AgentBindingFor("codex")
	if err != nil || b == nil {
		t.Fatalf("AgentBindingFor: %v, %v", b, err)
	}
	if b.Project != "/srv/demo" {
		t.Errorf("project = %q, want /srv/demo", b.Project)
	}
}

func TestBindingUpsertWritesItsOwnEvent(t *testing.T) {
	s := mustOpen(t)
	bindSeed(t, s, "codex", "/srv/demo")
	bindSeed(t, s, "codex", "/srv/other")
	events, _ := s.GovernanceSnapshot()
	upserts := 0
	for _, e := range events {
		if e.Kind == "binding.upsert" {
			upserts++
		}
	}
	if upserts != 2 {
		t.Errorf("binding.upsert events = %d, want one per upsert", upserts)
	}
	b, _ := s.AgentBindingFor("codex")
	if b.Project != "/srv/other" {
		t.Errorf("project = %q, want the rebind to /srv/other", b.Project)
	}
}

func TestBindingSameClaimPasses(t *testing.T) {
	s := mustOpen(t)
	bindSeed(t, s, "codex", "/srv/demo")
	if err := s.CheckProjectClaim("codex", "/srv/demo"); err != nil {
		t.Errorf("same-project claim refused: %v", err)
	}
}

func TestBindingForeignClaimRefused(t *testing.T) {
	s := mustOpen(t)
	bindSeed(t, s, "codex", "/srv/demo")
	err := s.CheckProjectClaim("codex", "/srv/elsewhere")
	if err == nil {
		t.Fatal("a foreign claim passed")
	}
	for _, want := range []string{"codex", "/srv/demo", "/srv/elsewhere"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("refusal %q does not name %q", err.Error(), want)
		}
	}
}

func TestBindingUnboundCallerPasses(t *testing.T) {
	s := mustOpen(t)
	if err := s.CheckProjectClaim("claude", "/srv/wherever"); err != nil {
		t.Errorf("unbound caller refused: %v", err)
	}
	if err := s.CheckProjectClaim("", "/srv/wherever"); err != nil {
		t.Errorf("system caller refused: %v", err)
	}
}

func TestBindingEmptyClaimPasses(t *testing.T) {
	s := mustOpen(t)
	bindSeed(t, s, "codex", "/srv/demo")
	// A call that claims no project at all has nothing for the binding to
	// judge; the claim checks judge the project parameter, not the agent.
	if err := s.CheckProjectClaim("codex", ""); err != nil {
		t.Errorf("claim-less call refused: %v", err)
	}
}

func TestBindingLookupFailureClosesTheCall(t *testing.T) {
	s := mustOpen(t)
	s.Close()
	if err := s.CheckProjectClaim("codex", "/srv/demo"); err == nil {
		t.Fatal("a broken binding lookup passed the claim: fail closed")
	}
}

func TestBindingUnknownAgentReadsAsUnbound(t *testing.T) {
	s := mustOpen(t)
	b, err := s.AgentBindingFor("nobody")
	if err != nil {
		t.Fatalf("AgentBindingFor: %v", err)
	}
	if b != nil {
		t.Errorf("row = %+v, want nil for an unbound agent", b)
	}
}
