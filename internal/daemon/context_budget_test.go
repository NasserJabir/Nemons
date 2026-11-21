package daemon

// Budget tests (F-015): the declared per-pack budget selects whole items —
// it never truncates a claim mid-text (half a claim is a false claim), and
// approved decisions survive budget pressure longest (selection priority),
// per the development study's "select before you compress" rule.

import (
	"fmt"
	"testing"
)

func packKnowledgeContents(t *testing.T, resp Response) []string {
	t.Helper()
	r := packResult(t, resp)
	pack := r["pack"].(map[string]any)
	knowledge := pack["knowledge"].([]any)
	out := make([]string, 0, len(knowledge))
	for _, k := range knowledge {
		out = append(out, k.(map[string]any)["content"].(string))
	}
	return out
}

func packCounters(t *testing.T, resp Response) map[string]any {
	t.Helper()
	return packResult(t, resp)["counters"].(map[string]any)
}

func TestContextPackBudgetDropsWholeItemsNeverTruncates(t *testing.T) {
	h, _ := mustHandler(t)
	seedPackLearning(t, h, "gotcha", fmt.Sprintf("%080d", 1), "")
	seedPackLearning(t, h, "gotcha", fmt.Sprintf("%080d", 2), "")
	seedPackLearning(t, h, "gotcha", fmt.Sprintf("%080d", 3), "")

	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "budgeted build", "project": "/w", "budget_chars": 100.0, "_source_agent": "claude", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("pack: %v", resp.Error)
	}
	got := packKnowledgeContents(t, resp)
	if len(got) == 0 || len(got) == 3 {
		t.Fatalf("budget should select a strict subset: got %d items", len(got))
	}
	for _, c := range got {
		if len([]rune(c)) != 80 {
			t.Fatalf("budget truncated an item to %d runes — whole-item rule broken: %q", len([]rune(c)), c)
		}
	}
	counters := packCounters(t, resp)
	if counters["budget_dropped_chars"].(float64) < 1 {
		t.Fatalf("expected dropped_chars > 0, counters: %v", counters)
	}
	if counters["knowledge_chars"].(float64) > 100 {
		t.Fatalf("char budget exceeded: %v", counters["knowledge_chars"])
	}
}

func TestContextPackBudgetDecisionsSurviveLongest(t *testing.T) {
	h, _ := mustHandler(t)
	seedPackLearning(t, h, "gotcha", fmt.Sprintf("%060d", 1), "")
	seedPackLearning(t, h, "gotcha", fmt.Sprintf("%060d", 2), "")
	seedPackLearning(t, h, "decision", fmt.Sprintf("%060d", 3), "")

	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "priority build", "project": "/w", "budget_chars": 65.0, "max_items": 1.0, "_source_agent": "claude", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("pack: %v", resp.Error)
	}
	got := packKnowledgeContents(t, resp)
	if len(got) != 1 {
		t.Fatalf("budget+max_items should leave exactly one item: got %d", len(got))
	}
	if got[0] != fmt.Sprintf("%060d", 3) {
		t.Fatalf("approved decision must survive longest, got: %q", got[0])
	}
}

func TestContextPackBudgetDefaultBackwardCompatible(t *testing.T) {
	h, _ := mustHandler(t)
	seedPackLearning(t, h, "gotcha", "small one", "")
	seedPackLearning(t, h, "decision", "small two", "")

	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "default build", "project": "/w", "_source_agent": "claude", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("pack: %v", resp.Error)
	}
	r := packResult(t, resp)
	got := packKnowledgeContents(t, resp)
	if len(got) != 2 {
		t.Fatalf("no budget params: all items must pass through, got %d", len(got))
	}
	budget := r["budget"].(map[string]any)
	if budget["max_chars"].(float64) != 0 {
		t.Fatalf("default max_chars must be 0 (uncapped), got %v", budget["max_chars"])
	}
	counters := packCounters(t, resp)
	if counters["budget_dropped_items"].(float64) != 0 || counters["budget_dropped_chars"].(float64) != 0 {
		t.Fatalf("default build must drop nothing: %v", counters)
	}
}
