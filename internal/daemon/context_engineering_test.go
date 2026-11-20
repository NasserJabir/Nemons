package daemon

// The context pack: curation over governed memory for one task in one
// project. The pack respects the same server-side scope view every read
// uses — a private row never crosses into a pack served to another agent —
// and the audit line carries counters and a fingerprint, never the content.

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
)

func seedPackLearning(t *testing.T, h *Handler, category, content, agent string) int64 {
	t.Helper()
	id, err := h.store.InsertLearning(&models.Learning{
		Category: category, Content: content, Project: "/w",
		CreatedAt: time.Now(), ModelUsed: "test", SourceAgent: agent,
		SharingScope: scopeForSeed(agent),
	})
	if err != nil {
		t.Fatalf("seed %s: %v", category, err)
	}
	return id
}

func scopeForSeed(agent string) string {
	if agent == "" {
		return "project"
	}
	return "private"
}

func packResult(t *testing.T, resp Response) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(resp.Result, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return m
}

func TestContextPackCuratesKnowledgeAndSkills(t *testing.T) {
	h, s := mustHandler(t)
	seedPackLearning(t, h, "gotcha", "the deploy needs the env file first", "")
	seedPackLearning(t, h, "decision", "we chose sqlite over postgres", "")
	seedPackLearning(t, h, "run_note", "tool chatter stays out of the pack", "")
	seedCapV1(t, h, "pack_test_cap")

	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "deploy the service", "project": "/w", "_source_agent": "claude"}})
	if resp.Error != "" {
		t.Fatalf("pack: %v", resp.Error)
	}
	r := packResult(t, resp)
	pack := r["pack"].(map[string]any)
	knowledge := pack["knowledge"].([]any)
	if len(knowledge) != 2 {
		t.Fatalf("knowledge = %d, want the two curated rows (run_note excluded)", len(knowledge))
	}
	if len(pack["skills"].([]any)) != 1 {
		t.Error("the live cap did not land in the skills section")
	}
	if r["fingerprint"].(string) == "" {
		t.Error("no pack fingerprint for the audit trail")
	}
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "context.pack.built" && e.Key == "/w" {
			found = true
		}
	}
	if !found {
		t.Error("no context.pack.built audit line")
	}
}

func TestContextPackHidesPrivateRowsFromOtherViewers(t *testing.T) {
	h, _ := mustHandler(t)
	seedPackLearning(t, h, "gotcha", "claude's private deployment trap", "claude")
	seedPackLearning(t, h, "gotcha", "shared deployment trap", "")

	// The pack served to gpt carries the shared row only.
	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "deploy", "project": "/w", "_source_agent": "gpt"}})
	knowledge := packResult(t, resp)["pack"].(map[string]any)["knowledge"].([]any)
	if len(knowledge) != 1 {
		t.Fatalf("gpt's pack = %d rows, want the shared one only", len(knowledge))
	}
	row := knowledge[0].(map[string]any)
	if strings.Contains(row["content"].(string), "private") {
		t.Error("a private row crossed into another agent's pack")
	}

	// Claude's own pack carries both.
	resp = h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "deploy", "project": "/w", "_source_agent": "claude"}})
	knowledge = packResult(t, resp)["pack"].(map[string]any)["knowledge"].([]any)
	if len(knowledge) != 2 {
		t.Errorf("claude's pack = %d rows, want both", len(knowledge))
	}
}

func TestContextPackRequiresTaskAndProject(t *testing.T) {
	h, _ := mustHandler(t)
	if resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{"project": "/w"}}); resp.Error == "" {
		t.Fatal("a pack was built without a task")
	}
	if resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{"task": "x"}}); resp.Error == "" {
		t.Fatal("a pack was built without a project")
	}
}

func TestContextPackRespectsTheCurationLimit(t *testing.T) {
	h, _ := mustHandler(t)
	for i := 0; i < 5; i++ {
		seedPackLearning(t, h, "decision", "decision row number", "")
	}
	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "review", "project": "/w", "max_items": 3.0, "_source_agent": "claude"}})
	knowledge := packResult(t, resp)["pack"].(map[string]any)["knowledge"].([]any)
	if len(knowledge) != 3 {
		t.Fatalf("knowledge = %d, want the bounded 3", len(knowledge))
	}
}
