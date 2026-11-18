package storage

// The per-agent persona spaces: overrides win on the same key, untouched
// shared rows pass through, agent-only keys surface, and every write leaves
// its own audit line. Resolution is deterministic for the same state.

import "testing"

func seedSharedTrait(t *testing.T, s *Store) {
	t.Helper()
	if _, err := s.db.Exec(`INSERT INTO persona_traits (user_id, dimension, trait_key, trait_value, confidence, source, evidence_count, first_seen, updated_at, superseded)
		VALUES ('default', 'style', 'verbosity', 'low', 0.9, 'bootstrapped', 3, datetime('now'), datetime('now'), FALSE),
		       ('default', 'style', 'tone', 'neutral', 0.9, 'bootstrapped', 3, datetime('now'), datetime('now'), FALSE)`); err != nil {
		t.Fatalf("seed shared traits: %v", err)
	}
}

func TestPersonaSharedViewWithoutAgent(t *testing.T) {
	s := mustOpen(t)
	seedSharedTrait(t, s)
	traits, err := s.GetResolvedPersonaTraits("", 0)
	if err != nil || len(traits) != 2 {
		t.Fatalf("traits = %d (%v), want the 2 shared rows", len(traits), err)
	}
}

func TestPersonaOverrideWinsOnTheSameKey(t *testing.T) {
	s := mustOpen(t)
	seedSharedTrait(t, s)
	if err := s.SetAgentPersonaTrait("codex", "style", "verbosity", "high"); err != nil {
		t.Fatalf("SetAgentPersonaTrait: %v", err)
	}
	traits, _ := s.GetResolvedPersonaTraits("codex", 0)
	if len(traits) != 2 {
		t.Fatalf("traits = %d, want 2 (override + untouched shared)", len(traits))
	}
	for _, tr := range traits {
		if tr.TraitKey == "verbosity" {
			if tr.TraitValue != "high" || tr.Source != "agent_override" {
				t.Errorf("verbosity = %q via %s, want the override", tr.TraitValue, tr.Source)
			}
		}
	}
}

func TestPersonaAgentOnlyKeySurfaces(t *testing.T) {
	s := mustOpen(t)
	seedSharedTrait(t, s)
	if err := s.SetAgentPersonaTrait("codex", "focus", "backend", "deep"); err != nil {
		t.Fatalf("SetAgentPersonaTrait: %v", err)
	}
	traits, _ := s.GetResolvedPersonaTraits("codex", 0)
	if len(traits) != 3 {
		t.Fatalf("traits = %d, want 2 shared + the agent-only key", len(traits))
	}
}

func TestPersonaClearRestoresShared(t *testing.T) {
	s := mustOpen(t)
	seedSharedTrait(t, s)
	_ = s.SetAgentPersonaTrait("codex", "style", "verbosity", "high")
	if err := s.ClearAgentPersonaTrait("codex", "style", "verbosity"); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	traits, _ := s.GetResolvedPersonaTraits("codex", 0)
	for _, tr := range traits {
		if tr.TraitKey == "verbosity" && tr.TraitValue != "low" {
			t.Errorf("verbosity = %q after clear, want the shared value", tr.TraitValue)
		}
	}
}

func TestPersonaDirectiveOverrideAndClear(t *testing.T) {
	s := mustOpen(t)
	if err := s.SetAgentPersonaDirective("codex", "be terse for codex"); err != nil {
		t.Fatalf("SetAgentPersonaDirective: %v", err)
	}
	d, _ := s.GetResolvedPersonaDirective("codex")
	if d == nil || d.Directive != "be terse for codex" {
		t.Fatalf("directive = %+v, want the override", d)
	}
	other, _ := s.GetResolvedPersonaDirective("claude")
	if other != nil && other.Directive == "be terse for codex" {
		t.Error("codex's directive leaked to claude")
	}
	_ = s.ClearAgentPersonaDirective("codex")
	cleared, _ := s.GetResolvedPersonaDirective("codex")
	if cleared != nil && cleared.Directive == "be terse for codex" {
		t.Error("the override survived the clear")
	}
}

func TestPersonaOverrideWritesItsAuditLine(t *testing.T) {
	s := mustOpen(t)
	seedSharedTrait(t, s)
	_ = s.SetAgentPersonaTrait("codex", "style", "verbosity", "high")
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "persona.agent_override" {
			found = true
		}
	}
	if !found {
		t.Error("no persona.agent_override event in the trail")
	}
}
