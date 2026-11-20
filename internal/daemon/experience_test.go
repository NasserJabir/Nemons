package daemon

// Evidence and experience gates: a failure is only learnable with a cause
// from the closed set and recorded evidence; validation checks evidence, it
// does not confer belief; the summary serves the reuse substrate through the
// caller's scope view.

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
)

func seedExperience(t *testing.T, h *Handler, task, outcome, attribution, evidence, agent string) *models.Learning {
	t.Helper()
	ctx, _ := json.Marshal(ExperienceMeta{Outcome: outcome, Attribution: attribution, Evidence: evidence})
	row := &models.Learning{
		Category: "experience", Content: task, Project: "/w",
		Context: string(ctx), CreatedAt: time.Now(), ModelUsed: "test",
		SourceAgent: agent, SharingScope: scopeForSeed(agent),
	}
	id, err := h.store.InsertLearning(row)
	if err != nil {
		t.Fatalf("seed experience: %v", err)
	}
	row.ID = id
	return row
}

func TestLogExperienceRequiresAttributionAndEvidenceForFailure(t *testing.T) {
	h, _ := mustHandler(t)
	// A bare "it failed" is not learnable: no attribution, no row.
	if resp := h.Handle(Request{Method: "log_experience", Params: map[string]any{
		"task": "deploy", "project": "/w", "outcome": "failure"}}); resp.Error == "" {
		t.Fatal("a failure without attribution was accepted")
	}
	// Attribution without evidence is still not learnable.
	if resp := h.Handle(Request{Method: "log_experience", Params: map[string]any{
		"task": "deploy", "project": "/w", "outcome": "failure", "attribution": "SKILL"}}); resp.Error == "" {
		t.Fatal("a failure without evidence was accepted")
	}
	// UNKNOWN is a legal explicit attribution.
	resp := h.Handle(Request{Method: "log_experience", Params: map[string]any{
		"task": "deploy", "project": "/w", "outcome": "failure", "attribution": "UNKNOWN",
		"evidence": "exit 1 on every retry, log at /tmp/x.log"}})
	if resp.Error != "" {
		t.Fatalf("UNKNOWN attribution rejected: %v", resp.Error)
	}
	// A success must not carry an attribution.
	if resp := h.Handle(Request{Method: "log_experience", Params: map[string]any{
		"task": "deploy", "project": "/w", "outcome": "success", "attribution": "SKILL"}}); resp.Error == "" {
		t.Fatal("a success with an attribution was accepted")
	}
}

func TestExperienceSummaryAggregatesAndRespectsScope(t *testing.T) {
	h, _ := mustHandler(t)
	seedExperience(t, h, "shared win", "success", "", "", "")
	seedExperience(t, h, "shared trap", "failure", "SKILL", "cap name check", "")
	seedExperience(t, h, "claude-only trap", "failure", "TOOL", "cli flag moved", "claude")

	resp := h.Handle(Request{Method: "get_experience_summary", Params: map[string]any{
		"project": "/w", "_source_agent": "gpt"}})
	if resp.Error != "" {
		t.Fatalf("summary: %v", resp.Error)
	}
	var m map[string]any
	if err := json.Unmarshal(resp.Result, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m["success"].(float64) != 1 || m["failure"].(float64) != 1 {
		t.Fatalf("gpt sees success=%v failure=%v, want 1/1 (claude's private row hidden)", m["success"], m["failure"])
	}
	byAtt := m["by_attribution"].(map[string]any)
	if byAtt["SKILL"].(float64) != 1 {
		t.Errorf("attribution tally wrong: %v", byAtt)
	}
	resp = h.Handle(Request{Method: "get_experience_summary", Params: map[string]any{
		"project": "/w", "_source_agent": "claude"}})
	json.Unmarshal(resp.Result, &m)
	if m["failure"].(float64) != 2 {
		t.Errorf("claude sees failure=%v, want 2 (own private row visible)", m["failure"])
	}
}

func TestValidateExperienceChecksEvidenceAndAudits(t *testing.T) {
	h, s := mustHandler(t)
	row := seedExperience(t, h, "no evidence task", "failure", "ENVIRONMENT", "", "")
	if resp := h.Handle(Request{Method: "validate_experience", Params: map[string]any{
		"id": float64(row.ID)}}); resp.Error == "" {
		t.Fatal("an evidence-free experience was validated")
	}
	row2 := seedExperience(t, h, "evidenced task", "failure", "TOOL", "flag removed in v2", "")
	resp := h.Handle(Request{Method: "validate_experience", Params: map[string]any{
		"id": float64(row2.ID), "_source_agent": "gpt"}})
	if resp.Error != "" {
		t.Fatalf("validation failed: %v", resp.Error)
	}
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "experience.validated" {
			found = true
		}
	}
	if !found {
		t.Error("no experience.validated audit line")
	}
}

func TestExperienceSummaryListsRecentFailuresForReuse(t *testing.T) {
	h, _ := mustHandler(t)
	seedExperience(t, h, "trap one", "failure", "SKILL", "e1", "")
	seedExperience(t, h, "trap two", "failure", "KNOWLEDGE", "e2", "")
	resp := h.Handle(Request{Method: "get_experience_summary", Params: map[string]any{
		"project": "/w"}})
	var m map[string]any
	json.Unmarshal(resp.Result, &m)
	recent := m["recent_failures"].([]any)
	if len(recent) != 2 {
		t.Fatalf("recent failures = %d, want 2", len(recent))
	}
	first := recent[0].(map[string]any)
	if first["attribution"] == "" {
		t.Error("a failure surfaced without its attribution")
	}
}
