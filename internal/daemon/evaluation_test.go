package daemon

// Stage-10 gates: the extraction gate refuses a citation without its hash;
// verification checks real bytes inside the project scope; golden baselines
// are the first recorded run; the token economy surfaces idle knowledge and
// touches nothing automatically.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/carsteneu/yesmem/internal/models"
)

func unpack(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return m
}

func TestCitationGateRequiresSourceHash(t *testing.T) {
	h, _ := mustHandler(t)
	if resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "a claim citing a file", "category": "gotcha", "project": "/w",
		"source_file": "/w/docs/design.md"}}); resp.Error == "" {
		t.Fatal("a citation without its hash was stored")
	}
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "a claim citing a file", "category": "gotcha", "project": "/w",
		"source_file": "/w/docs/design.md", "source_hash": "abc123"}})
	if resp.Error != "" {
		t.Fatalf("cited row refused: %v", resp.Error)
	}
}

func TestVerifyCitationChecksTheRealBytes(t *testing.T) {
	h, s := mustHandler(t)
	dir := t.TempDir()
	body := []byte("the design decision, verbatim")
	if err := os.WriteFile(filepath.Join(dir, "design.md"), body, 0o600); err != nil {
		t.Fatal(err)
	}
	row := &models.Learning{
		Category: "decision", Content: "claims the design file", Project: dir,
		CreatedAt: time.Now(), ModelUsed: "test",
		SourceFile: filepath.Join(dir, "design.md"),
	}
	id, err := h.store.InsertLearning(row)
	if err != nil {
		t.Fatal(err)
	}

	// No readable file: refused, not silently unverified.
	bad := &models.Learning{Category: "decision", Content: "gone file", Project: dir,
		CreatedAt: time.Now(), ModelUsed: "test",
		SourceFile: filepath.Join(dir, "missing.md")}
	badID, _ := h.store.InsertLearning(bad)
	if resp := h.Handle(Request{Method: "verify_citation", Params: map[string]any{
		"id": float64(badID)}}); resp.Error == "" {
		t.Fatal("a citation to a missing file verified anyway")
	}

	// First verification records the computed hash.
	resp := h.Handle(Request{Method: "verify_citation", Params: map[string]any{
		"id": float64(id)}})
	if resp.Error != "" {
		t.Fatalf("first verification: %v", resp.Error)
	}
	if unpack(t, resp.Result)["hash_recorded"] != true {
		t.Error("the computed hash was not recorded on first verification")
	}
	events, _ := s.GovernanceSnapshot()
	verified := false
	for _, e := range events {
		if e.Kind == "citation.verified" {
			verified = true
		}
	}
	if !verified {
		t.Error("no citation.verified audit line")
	}
}

func TestGoldenBaselineFirstResult(t *testing.T) {
	h, _ := mustHandler(t)
	r1 := h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t1", "project": "/w", "passed": true}})
	if r1.Error != "" {
		t.Fatalf("first result: %s", r1.Error)
	}
	if unpack(t, r1.Result)["baseline"] != true {
		t.Error("the first recorded run is not marked as the baseline")
	}
	r2 := h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t1", "project": "/w", "passed": false}})
	if unpack(t, r2.Result)["baseline"] == true {
		t.Error("a later run was marked as the baseline")
	}
}

func TestEvaluationSummaryTalliesAgainstBaseline(t *testing.T) {
	h, _ := mustHandler(t)
	h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t1", "project": "/w", "passed": true}})
	h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t1", "project": "/w", "passed": false}})
	resp := h.Handle(Request{Method: "get_evaluation_summary", Params: map[string]any{
		"project": "/w"}})
	m := unpack(t, resp.Result)
	tasks := m["golden_tasks"].([]any)
	if len(tasks) != 1 {
		t.Fatalf("golden tasks = %d, want 1", len(tasks))
	}
	task := tasks[0].(map[string]any)
	if task["runs"].(float64) != 2 || task["passes"].(float64) != 1 {
		t.Errorf("tally wrong: %v", task)
	}
	if !task["baseline_passed"].(bool) || task["last_passed"].(bool) {
		t.Errorf("baseline/last wrong: %v", task)
	}
}

func TestTokenEconomySurfacesIdleKnowledge(t *testing.T) {
	h, _ := mustHandler(t)
	idle := seedPackLearning(t, h, "gotcha", "injected but never used", "")
	used := seedPackLearning(t, h, "decision", "injected and used", "")
	if err := h.store.IncrementInjectCounts([]int64{idle, used}); err != nil {
		t.Fatal(err)
	}
	if err := h.store.IncrementUseCounts([]int64{used}); err != nil {
		t.Fatal(err)
	}
	resp := h.Handle(Request{Method: "get_evaluation_summary", Params: map[string]any{
		"project": "/w"}})
	m := unpack(t, resp.Result)
	economy := m["token_economy"].(map[string]any)
	if economy["injected"].(float64) != 2 || economy["used"].(float64) != 1 {
		t.Fatalf("economy counters wrong: %v", economy)
	}
	idleList := economy["idle"].([]any)
	if len(idleList) != 1 {
		t.Fatalf("idle = %d, want the one unused row", len(idleList))
	}
	if idleList[0].(map[string]any)["category"].(string) != "gotcha" {
		t.Errorf("idle row is not the unused one")
	}
}
