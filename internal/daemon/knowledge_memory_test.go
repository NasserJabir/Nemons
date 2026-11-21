package daemon

// The knowledge-and-memory stage: transcripts are searchable inside their
// project, and the counters picture is complete (live/superseded, categories,
// scopes, projects).

import (
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
)

func seedTranscript(t *testing.T, h *Handler, sessionID, project, content string) {
	t.Helper()
	if err := h.store.UpsertSession(&models.Session{ID: sessionID, Project: project, StartedAt: time.Now()}); err != nil {
		t.Fatalf("seed session: %v", err)
	}
	if err := h.store.InsertMessages([]models.Message{{
		SessionID: sessionID, Role: "user", MessageType: "text",
		Content: content, Timestamp: time.Now(),
	}}); err != nil {
		t.Fatalf("seed message: %v", err)
	}
}



func hitsOf(t *testing.T, m map[string]any) []map[string]any {
	t.Helper()
	raw, _ := m["hits"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		out = append(out, item.(map[string]any))
	}
	return out
}

func TestTranscriptSearchFindsEveryTermInProject(t *testing.T) {
	h, _ := mustHandler(t)
	seedTranscript(t, h, "sess-1", "/w", "the deploy script fails on permissions")
	seedTranscript(t, h, "sess-2", "/w", "unrelated note about the weather")
	seedTranscript(t, h, "sess-3", "/other", "deploy script notes from another project")

	resp := h.Handle(Request{Method: "search_transcripts", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved",
		"query": "deploy script", "project": "/w"}})
	if resp.Error != "" {
		t.Fatalf("search: %v", resp.Error)
	}
	hits := hitsOf(t, resultMap(t, resp))
	if len(hits) != 1 {
		t.Fatalf("hits = %d, want only the /w transcript", len(hits))
	}
	// The other project's transcript never crosses.
	resp = h.Handle(Request{Method: "search_transcripts", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved",
		"query": "deploy script", "project": "/other"}})
	hits = hitsOf(t, resultMap(t, resp))
	if len(hits) != 1 || hits[0]["session_id"] != "sess-3" {
		t.Errorf("the other project's scope leaked or lost its line: %v", hits)
	}
}

func TestTranscriptSearchRefusesAnEmptyQuery(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "search_transcripts", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved","query": "   "}})
	if resp.Error == "" {
		t.Fatal("an empty query searched everything")
	}
}

func TestKnowledgeStatsCountsTheWholePicture(t *testing.T) {
	h, s := mustHandler(t)
	seedTranscript(t, h, "sess-9", "/w", "knowledge stats test session")
	for _, c := range []string{"gotcha", "gotcha", "decision"} {
		if _, err := s.InsertLearning(&models.Learning{
			Category: c, Content: "live " + c, Project: "/w",
			CreatedAt: time.Now(), ModelUsed: "test",
		}); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if _, err := s.InsertLearning(&models.Learning{
		Category: "gotcha", Content: "claude private", Project: "/w",
		CreatedAt: time.Now(), ModelUsed: "test", SourceAgent: "claude", SharingScope: "private",
	}); err != nil {
		t.Fatalf("seed private: %v", err)
	}
	resp := h.Handle(Request{Method: "get_knowledge_stats", Params: nil})
	if resp.Error != "" {
		t.Fatalf("stats: %v", resp.Error)
	}
	r := resultMap(t, resp)
	if r["live"].(float64) != 4 {
		t.Errorf("live = %v, want 4", r["live"])
	}
	scopes := r["by_scope"].(map[string]any)
	if scopes["shared"].(float64) != 3 || scopes["private"].(float64) != 1 {
		t.Errorf("by_scope = %v, want 3 shared + 1 private", scopes)
	}
	if _, ok := r["by_category"]; !ok {
		t.Error("no per-category counters")
	}
	if _, ok := r["top_projects"]; !ok {
		t.Error("no per-project counters")
	}
}
