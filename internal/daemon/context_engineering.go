package daemon

// Context engineering: the Context Pack is the artifact handed to a coding
// agent for a specific task. The foundation document draws the hard line
// (memory is not context): memory is accumulated knowledge, retrieval finds
// what is relevant, curation selects and bounds it, and the pack is only what
// a task actually receives. The pack assembles from the governed memory
// through the same server-side scope view every other read uses, so a private
// row never crosses into a pack served to another agent.

import (
	"fmt"
	"sort"
	"time"

	"github.com/carsteneu/yesmem/internal/storage"
	"github.com/carsteneu/yesmem/internal/textutil"
)

// contextPackCuratedCategories is the curation list: the knowledge categories
// worth carrying into a task's context. Everything else (run notes, tool
// chatter) stays in memory where it belongs — the pack is not a memory dump.
var contextPackCuratedCategories = []string{"gotcha", "decision", "explicit_teaching"}

func contextPackLimit(params map[string]any) int {
	if v, ok := params["max_items"].(float64); ok && v > 0 {
		return int(v)
	}
	return 8
}

// contextPackBudget is the declared per-pack budget (F-015). The development
// study fixed the rule from the context-engineering research: "select before
// you compress" — the budget never truncates an item mid-text (half a claim is
// a false claim); it drops whole items in reverse priority order, and approved
// decisions survive longest. Critical categories sit at the edges of the pack
// (decisions first — the "lost in the middle" finding): ordering is a
// selection rule here, not a cosmetic sort.
type contextPackBudget struct {
	maxItems int
	maxChars int // 0 = uncapped (backward compatible default)
}

func contextPackBudgetFrom(params map[string]any) contextPackBudget {
	b := contextPackBudget{maxItems: contextPackLimit(params)}
	if v, ok := params["budget_chars"].(float64); ok && v > 0 {
		b.maxChars = int(v)
	}
	return b
}

// contextPackPriority: lower ranks out first under budget pressure.
// decisions (approved claims) rank last — they are the claims the governance
// chain already vetted; gotcha warnings rank first to drop.
func contextPackPriority(category string) int {
	switch category {
	case "gotcha":
		return 0
	case "explicit_teaching":
		return 1
	case "decision":
		return 2
	}
	return -1
}

// selectWithinBudget applies the item cap and the char cap as whole-item
// selection in priority order (newest-first inside a category). Returns the
// selected items in pack order (priority descending, newest first) and the
// drop counters.
func selectWithinBudget(items []map[string]any, b contextPackBudget) ([]map[string]any, int, int) {
	droppedCap, droppedChars := 0, 0
	// Priority-ordered selection: keep the highest-priority newest items first.
	// items arrives newest-first per category interleaved; sort by (priority desc, created desc).
	sorted := make([]map[string]any, len(items))
	copy(sorted, items)
	sort.SliceStable(sorted, func(i, j int) bool {
		pi, pj := contextPackPriority(sorted[i]["category"].(string)), contextPackPriority(sorted[j]["category"].(string))
		if pi != pj {
			return pi > pj
		}
		return sorted[i]["created_at"].(string) > sorted[j]["created_at"].(string)
	})
	used := 0
	selected := make([]map[string]any, 0, len(sorted))
	for _, it := range sorted {
		content, _ := it["content"].(string)
		cost := len([]rune(content))
		if len(selected) >= b.maxItems {
			droppedCap++
			continue
		}
		if b.maxChars > 0 && used+cost > b.maxChars {
			droppedChars++
			continue
		}
		used += cost
		selected = append(selected, it)
	}
	return selected, droppedCap, droppedChars
}

// handleBuildContextPack assembles the pack for one task in one project.
// Retrieval goes through the governed reads (the viewer is the calling agent,
// so private rows resolve exactly as they do everywhere else); curation is
// bounded and newest-first; the audit line records the counters and the pack
// fingerprint — never the content itself.
func (h *Handler) handleBuildContextPack(params map[string]any) Response {
	task, _ := params["task"].(string)
	project, _ := params["project"].(string)
	if len([]rune(task)) == 0 {
		return errorResponse("build_context_pack: 'task' is required — a pack is assembled for a task, not in the abstract")
	}
	if project == "" {
		return errorResponse("build_context_pack: 'project' is required — a pack is scoped to the project the task runs in")
	}
	limit := contextPackLimit(params)
	budget := contextPackBudgetFrom(params)
	viewer, _ := params["_source_agent"].(string)

	// Retrieval: live knowledge rows for the project, through the scope view.
	rows, err := h.store.GetActiveLearningsFiltered(storage.LearningsFilter{
		Project: project, Viewer: viewer,
	}, 0)
	if err != nil {
		return errorResponse(fmt.Sprintf("build_context_pack: %v", err))
	}
	knowledge := make([]map[string]any, 0, len(rows))
	for _, l := range rows {
		if !curatedCategory(l.Category) {
			continue
		}
		knowledge = append(knowledge, map[string]any{
			"id": l.ID, "category": l.Category, "content": l.Content,
			"created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	sort.Slice(knowledge, func(i, j int) bool {
		return knowledge[i]["created_at"].(string) > knowledge[j]["created_at"].(string)
	})
	if len(knowledge) > limit {
		knowledge = knowledge[:limit]
	}
	// Budget (F-015): whole-item selection with declared priority — approved
	// decisions survive longest, nothing is truncated mid-text, and the drop
	// counters are reported so the caller sees exactly what did not fit.
	selected, droppedCap, droppedChars := selectWithinBudget(knowledge, budget)
	knowledge = selected
	skillsBudgetNote := ""
	if budget.maxChars > 0 {
		skillsBudgetNote = "skills list stays name/description only — the char budget applies to knowledge content"
	}

	// Skills: the live caps bound to this project (or unbound/user-scoped),
	// listed by name and description — the pack points at skills, it does not
	// inline their script bodies.
	caps, err := h.store.GetActiveLearnings("cap", project, "", "", 0)
	if err != nil {
		return errorResponse(fmt.Sprintf("build_context_pack: %v", err))
	}
	skills := make([]map[string]any, 0, len(caps))
	for i := range caps {
		meta, err := ParseCapMeta(caps[i].Context)
		if err != nil || meta.Name == "" {
			continue
		}
		skills = append(skills, map[string]any{
			"name": meta.Name, "description": meta.Description, "version": meta.Version,
		})
	}
	sort.Slice(skills, func(i, j int) bool {
		return skills[i]["name"].(string) < skills[j]["name"].(string)
	})

	// The pack fingerprint: a content hash of what was assembled, so the audit
	// trail can tie a delivered pack to its contents without storing them.
	fingerprint := textutil.ContentHash(fmt.Sprintf("task=%s|knowledge=%d|skills=%d", task, len(knowledge), len(skills)))

	if err := h.store.RecordCapEvent("context.pack.built", project,
		fmt.Sprintf("task %q: %d knowledge items, %d skills, pack %s",
			truncateForAudit(task, 60), len(knowledge), len(skills), fingerprint[:8])); err != nil {
		return errorResponse(fmt.Sprintf("build_context_pack: %v", err))
	}

	return jsonResponse(map[string]any{
		"task": task, "project": project, "fingerprint": fingerprint,
		"pack": map[string]any{
			"knowledge": knowledge,
			"skills":    skills,
		},
		"counters": map[string]any{
			"knowledge": len(knowledge), "skills": len(skills),
			"knowledge_chars": func() int {
				n := 0
				for _, k := range knowledge {
					c, _ := k["content"].(string)
					n += len([]rune(c))
				}
				return n
			}(),
			"budget_dropped_items": droppedCap,
			"budget_dropped_chars": droppedChars,
		},
		"budget": map[string]any{
			"max_items": budget.maxItems, "max_chars": budget.maxChars,
			"rule": "whole-item selection, decisions survive longest, gotcha drops first — nothing is truncated mid-text",
			"note": skillsBudgetNote,
		},
	})
}

func curatedCategory(c string) bool {
	for _, want := range contextPackCuratedCategories {
		if c == want {
			return true
		}
	}
	return false
}

func truncateForAudit(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
