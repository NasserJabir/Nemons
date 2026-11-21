package daemon

// The approval-provenance priority boundary tests (remediation 02 WS-F): the
// decision tier is earned by the row's recorded approval provenance
// (Source), never inferred from the category name. Equal priorities order
// deterministically newest-first, budget exhaustion drops whole items in
// reverse priority, and mixed approval states never share a tier.

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
)

// seedWithSource inserts a curated row with an explicit approval provenance.
func seedWithSource(t *testing.T, h *Handler, category, content, source string, age time.Duration) int64 {
	t.Helper()
	id, err := h.store.InsertLearning(&models.Learning{
		Category: category, Content: content, Project: "/w",
		Source: source, SourceAgent: "claude", SharingScope: "project",
		ModelUsed: "test", CreatedAt: time.Now().Add(-age),
	})
	if err != nil {
		t.Fatalf("seed %s/%s: %v", category, source, err)
	}
	return id
}

func packBuildWithBudget(t *testing.T, h *Handler, maxItems float64) []string {
	t.Helper()
	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "priority build", "project": "/w", "max_items": maxItems,
		"_source_agent": "claude", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("pack: %v", resp.Error)
	}
	return packKnowledgeContents(t, resp)
}

// An unvetted decision (llm_extracted) must not enjoy the decision tier: the
// vetted decision survives budget pressure even though it is the older row.
func TestDecisionPriorityIsEarnedByApprovalProvenance(t *testing.T) {
	h, _ := mustHandler(t)
	seedWithSource(t, h, "decision", "vetted: "+fmt.Sprintf("%060d", 1), "user_stated", 6*time.Hour)
	seedWithSource(t, h, "decision", "unvetted: "+fmt.Sprintf("%060d", 2), "llm_extracted", time.Hour)

	got := packBuildWithBudget(t, h, 1)
	if len(got) != 1 {
		t.Fatalf("budget allows one item, got %d", len(got))
	}
	if !strings.HasPrefix(got[0], "vetted:") {
		t.Fatalf("the unvetted decision won the decision tier: %q", got[0])
	}
}

// Equal priorities are deterministic: newest first, never a coin flip.
func TestEqualPriorityOrdersNewestFirst(t *testing.T) {
	h, _ := mustHandler(t)
	seedWithSource(t, h, "decision", "older vetted "+fmt.Sprintf("%060d", 1), "agreed_upon", 6*time.Hour)
	seedWithSource(t, h, "decision", "newer vetted "+fmt.Sprintf("%060d", 2), "agreed_upon", time.Hour)

	got := packBuildWithBudget(t, h, 1)
	if len(got) != 1 || !strings.HasPrefix(got[0], "newer vetted") {
		t.Fatalf("equal priorities must order newest-first, got %v", got)
	}
}

// Budget exhaustion drops whole items in reverse priority and never truncates
// a claim mid-text.
func TestBudgetExhaustionDropsWholeItemsInReversePriority(t *testing.T) {
	h, _ := mustHandler(t)
	gotcha := "gotcha never run rm-rf on prod " + fmt.Sprintf("%060d", 0)
	teaching := "teaching always pin the dependency " + fmt.Sprintf("%060d", 1)
	decision := "vetted decision ship the rollback first " + fmt.Sprintf("%060d", 2)
	seedWithSource(t, h, "gotcha", gotcha, "user_stated", 6*time.Hour)
	seedWithSource(t, h, "explicit_teaching", teaching, "user_stated", 5*time.Hour)
	seedWithSource(t, h, "decision", decision, "user_stated", 4*time.Hour)

	one := packBuildWithBudget(t, h, 1)
	if len(one) != 1 || one[0] != decision {
		t.Fatalf("max_items=1 must keep the vetted decision, got %v", one)
	}
	two := packBuildWithBudget(t, h, 2)
	if len(two) != 2 || two[0] != decision || two[1] != teaching {
		t.Fatalf("max_items=2 must keep decision then teaching, got %v", two)
	}
	for _, item := range append(two, one...) {
		if !strings.HasSuffix(item, fmt.Sprintf("%060d", 0)) &&
			!strings.HasSuffix(item, fmt.Sprintf("%060d", 1)) &&
			!strings.HasSuffix(item, fmt.Sprintf("%060d", 2)) {
			t.Fatalf("an item was truncated mid-text: %q", item)
		}
	}
}

// Mixed approval states: the unvetted decision and the vetted one share the
// pool with a gotcha; the gotcha drops first, then the tiers order by
// provenance and recency — never by category name alone.
func TestMixedApprovalStatesUnderTightBudget(t *testing.T) {
	h, _ := mustHandler(t)
	seedWithSource(t, h, "gotcha", "fresh gotcha "+fmt.Sprintf("%060d", 0), "user_stated", time.Hour)
	seedWithSource(t, h, "decision", "unvetted newer "+fmt.Sprintf("%060d", 2), "llm_extracted", time.Hour)
	seedWithSource(t, h, "decision", "vetted older "+fmt.Sprintf("%060d", 3), "agreed_upon", 8*time.Hour)

	got := packBuildWithBudget(t, h, 2)
	if len(got) != 2 {
		t.Fatalf("budget allows two items, got %d", len(got))
	}
	if got[0] != "vetted older "+fmt.Sprintf("%060d", 3) {
		t.Fatalf("the vetted decision must lead, got %v", got)
	}
	if got[1] != "unvetted newer "+fmt.Sprintf("%060d", 2) {
		t.Fatalf("the unvetted decision outranks nothing above its tier, got %v", got)
	}
	for _, item := range got {
		if strings.HasPrefix(item, "fresh gotcha") {
			t.Fatal("a gotcha survived budget pressure over both decisions")
		}
	}
}
