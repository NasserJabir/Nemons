package daemon

// Change-integrity gates: a regression is a baseline drop surfaced to the
// governance gate, never an automatic fix; typed lineage is a closed set
// inside one project, never free text across scopes.

import (
	"strconv"
	"testing"

	"github.com/carsteneu/yesmem/internal/models"
)

func fmtSprintInt(id int64) string {
	return strconv.FormatInt(id, 10)
}

func modelsLearningForTest(project, context string) *models.Learning {
	return &models.Learning{
		Category: "experience", Content: "cross", Project: project,
		Context: context, ModelUsed: "test",
	}
}

func TestCheckRegressionFlagsBaselineDrop(t *testing.T) {
	h, _ := mustHandler(t)
	h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t1", "project": "/w", "passed": true}})
	h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t1", "project": "/w", "passed": false}})
	resp := h.Handle(Request{Method: "check_regression", Params: map[string]any{
		"project": "/w"}})
	m := unpack(t, resp.Result)
	if m["tasks_checked"].(float64) != 1 {
		t.Fatalf("tasks checked = %v", m["tasks_checked"])
	}
	regs := m["regressions"].([]any)
	if len(regs) != 1 {
		t.Fatalf("regressions = %d, want the baseline drop flagged", len(regs))
	}
	if regs[0].(map[string]any)["task_id"].(string) != "t1" {
		t.Errorf("wrong task flagged: %v", regs[0])
	}
}

func TestCheckRegressionCleanAndAudits(t *testing.T) {
	h, s := mustHandler(t)
	h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t2", "project": "/w", "passed": true}})
	h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t2", "project": "/w", "passed": true}})
	resp := h.Handle(Request{Method: "check_regression", Params: map[string]any{
		"project": "/w"}})
	m := unpack(t, resp.Result)
	if len(m["regressions"].([]any)) != 0 || m["clean"].(float64) != 1 {
		t.Fatalf("a clean task was flagged: %v", m)
	}
	// The drop itself is audited for the governance gate.
	h.Handle(Request{Method: "record_golden_result", Params: map[string]any{
		"task_id": "t2", "project": "/w", "passed": false}})
	h.Handle(Request{Method: "check_regression", Params: map[string]any{
		"project": "/w"}})
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "golden.regression" {
			found = true
		}
	}
	if !found {
		t.Error("no golden.regression audit line")
	}
}

func TestRelateTypedClosedSetAndStorage(t *testing.T) {
	h, _ := mustHandler(t)
	a := seedPackLearning(t, h, "decision", "the decision row", "")
	b := seedPackLearning(t, h, "gotcha", "the evidence row", "")
	if resp := h.Handle(Request{Method: "relate_typed", Params: map[string]any{
		"from_id": float64(a), "to_id": float64(b), "type": "supportive"}}); resp.Error == "" {
		t.Fatal("a free-text relation type was accepted")
	}
	resp := h.Handle(Request{Method: "relate_typed", Params: map[string]any{
		"from_id": float64(a), "to_id": float64(b), "type": "EVIDENCES"}})
	if resp.Error != "" {
		t.Fatalf("closed-set relation refused: %v", resp.Error)
	}
	assocs, err := h.store.GetAssociationsFrom("learning", fmtSprintInt(a))
	if err != nil || len(assocs) != 1 {
		t.Fatalf("lineage not stored: %v (%d)", err, len(assocs))
	}
	if assocs[0].RelationType != "EVIDENCES" {
		t.Errorf("stored type = %q", assocs[0].RelationType)
	}
}

func TestRelateTypedRefusesCrossProject(t *testing.T) {
	h, _ := mustHandler(t)
	a := seedPackLearning(t, h, "decision", "in /w", "")
	ctx := `{"outcome":"failure","attribution":"TOOL","evidence":"e"}`
	id, err := h.store.InsertLearning(modelsLearningForTest("/elsewhere", ctx))
	if err != nil {
		t.Fatal(err)
	}
	if resp := h.Handle(Request{Method: "relate_typed", Params: map[string]any{
		"from_id": float64(a), "to_id": float64(id), "type": "SUPERSEDES"}}); resp.Error == "" {
		t.Fatal("cross-project lineage was accepted")
	}
}
