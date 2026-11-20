package hooks

import (
	"testing"
)

func TestMaybeSuppressUnavailableSkill_DropsUnavailableSuggestion(t *testing.T) {
	available := map[string]bool{
		"nemons-config":    true,
		"nemons-remember":  true,
		// nemons-docs NOT available
	}
	d := GuardDecision{Decision: "SUGGEST", Suggestion: "nemons-docs: use docs_search before guessing"}
	got := maybeSuppressUnavailableSkill(d, available)
	if got.Decision != "PASS" {
		t.Errorf("expected PASS for unavailable skill, got %q (suggestion=%q)", got.Decision, got.Suggestion)
	}
	if got.Suggestion != "" {
		t.Errorf("expected empty suggestion after dropping unavailable skill, got %q", got.Suggestion)
	}
}

func TestMaybeSuppressUnavailableSkill_KeepsAvailableSuggestion(t *testing.T) {
	available := map[string]bool{"nemons-config": true}
	d := GuardDecision{Decision: "SUGGEST", Suggestion: "nemons-config: pin this"}
	got := maybeSuppressUnavailableSkill(d, available)
	if got.Decision != "SUGGEST" {
		t.Errorf("available skill was dropped; expected SUGGEST, got %q", got.Decision)
	}
	if got.Suggestion != "nemons-config: pin this" {
		t.Errorf("suggestion text changed; got %q", got.Suggestion)
	}
}

func TestMaybeSuppressUnavailableSkill_NonSuggestPassesThrough(t *testing.T) {
	available := map[string]bool{}
	for _, dec := range []string{"PASS", "BLOCK"} {
		d := GuardDecision{Decision: dec, Suggestion: "nemons-docs: whatever"}
		got := maybeSuppressUnavailableSkill(d, available)
		if got.Decision != dec {
			t.Errorf("%q decision was altered to %q", dec, got.Decision)
		}
	}
}

func TestMaybeSuppressUnavailableSkill_EmptySuggestionPassesThrough(t *testing.T) {
	available := map[string]bool{}
	d := GuardDecision{Decision: "SUGGEST", Suggestion: ""}
	got := maybeSuppressUnavailableSkill(d, available)
	if got.Decision != "SUGGEST" {
		t.Errorf("empty suggestion should pass through, got %q", got.Decision)
	}
}

func TestMaybeSuppressUnavailableSkill_EmptyAvailableSetPassesThrough(t *testing.T) {
	// Conservative fallback: if we can't read the filesystem (empty set),
	// do not filter — pass through conservatively.
	d := GuardDecision{Decision: "SUGGEST", Suggestion: "nemons-docs: whatever"}
	got := maybeSuppressUnavailableSkill(d, nil)
	if got.Decision != "SUGGEST" {
		t.Errorf("empty available set should pass through, got %q", got.Decision)
	}
}

func TestMaybeSuppressUnavailableSkill_ExtractsSkillBeforeColon(t *testing.T) {
	// DeepSeek formats as "SkillName: short reason max 60 chars"
	// Must extract skill name correctly even with reason text after colon.
	available := map[string]bool{"test-driven-development": true}
	d := GuardDecision{Decision: "SUGGEST", Suggestion: "test-driven-development: write red test first"}
	got := maybeSuppressUnavailableSkill(d, available)
	if got.Decision != "SUGGEST" {
		t.Errorf("available skill was dropped")
	}
}

// The core turns a block it will not enforce into a SUGGEST whose text starts with a skill name and carries
// the violation. That is a notice about rules, not a skill the model chose: dropping it as a ghost skill
// would silence exactly the text the downgrade exists for.
func TestMaybeSuppressUnavailableSkill_KeepsADowngradedBlocksNotice(t *testing.T) {
	available := map[string]bool{"nemons-config": true}
	d := GuardDecision{
		Decision:   "SUGGEST",
		Suggestion: "nemons-remember: mandatory check — Rule 42: never commit secrets",
		Violations: []string{"Rule 42: never commit secrets"},
	}

	got := maybeSuppressUnavailableSkill(d, available)

	if got.Decision != "SUGGEST" {
		t.Fatalf("decision = %q, want the notice kept even though the skill is not installed", got.Decision)
	}
	if got.Suggestion == "" {
		t.Fatal("suggestion = empty, want the citation to reach the model")
	}
}
