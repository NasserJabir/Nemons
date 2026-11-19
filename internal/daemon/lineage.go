package daemon

// Change integrity (ladder stage 10+, closing the documented gaps):
// F-045 regression detection — golden tasks are the stable reference set,
// so a task that passed its baseline and now fails is a regression introduced
// by a change; the check reads and audits, it never fixes anything (14.5).
// F-056 typed lineage — relations between learnings come from a closed set,
// not free text: evidence, supersession, causation, derivation, invalidation.

import (
	"fmt"

	"github.com/carsteneu/yesmem/internal/models"
	"github.com/carsteneu/yesmem/internal/storage"
)

// handleCheckRegression walks the golden reference set through the caller's
// scope view and flags every task whose baseline passed but whose latest run
// failed. A regression is evidence for the governance gate, not an automatic
// rollback.
func (h *Handler) handleCheckRegression(params map[string]any) Response {
	project, _ := params["project"].(string)
	if project == "" {
		return errorResponse("check_regression: 'project' is required")
	}
	viewer, _ := params["_source_agent"].(string)
	rows, err := h.store.GetActiveLearningsFiltered(storage.LearningsFilter{
		Project: project, Viewer: viewer,
	}, 0)
	if err != nil {
		return errorResponse(fmt.Sprintf("check_regression: %v", err))
	}
	type task struct {
		baselinePassed bool
		lastPassed     bool
		runs           int
	}
	byTask := map[string]*task{}
	var order []string
	for i := range rows {
		if rows[i].Category != "golden" {
			continue
		}
		m, err := parseGoldenMeta(rows[i].Context)
		if err != nil {
			continue
		}
		t, ok := byTask[m.TaskID]
		if !ok {
			t = &task{baselinePassed: m.Passed}
			byTask[m.TaskID] = t
			order = append(order, m.TaskID)
		}
		t.runs++
		t.lastPassed = m.Passed
	}
	regressions := []map[string]any{}
	for _, id := range order {
		t := byTask[id]
		if t.baselinePassed && !t.lastPassed {
			if err := h.store.RecordCapEvent("golden.regression", project,
				fmt.Sprintf("task %s: passed its baseline, latest run failed", id)); err != nil {
				return errorResponse(fmt.Sprintf("check_regression: %v", err))
			}
			regressions = append(regressions, map[string]any{
				"task_id": id, "baseline_passed": t.baselinePassed,
				"last_passed": t.lastPassed, "runs": t.runs,
			})
		}
	}
	return jsonResponse(map[string]any{
		"project": project, "tasks_checked": len(order),
		"regressions": regressions, "clean": len(order) - len(regressions),
	})
}

// LineageTypes is the closed set of typed lineage relations (F-056). Free-text
// relations are refused here: lineage that cannot be enumerated cannot be
// trusted or traversed.
var LineageTypes = map[string]bool{
	"EVIDENCES": true, "SUPERSEDES": true, "CAUSED_BY": true,
	"DERIVED_FROM": true, "INVALIDATES": true,
}

// handleRelateTyped stores a typed lineage relation between two learnings.
// Both rows must exist in the same project; the type must come from the
// closed set. Reading the lineage back is plain GetAssociationsFrom — no new
// storage layer.
func (h *Handler) handleRelateTyped(params map[string]any) Response {
	fromID, _ := params["from_id"].(float64)
	toID, _ := params["to_id"].(float64)
	relType, _ := params["type"].(string)
	if fromID == 0 || toID == 0 {
		return errorResponse("relate_typed: 'from_id' and 'to_id' are required")
	}
	if !LineageTypes[relType] {
		return errorResponse(fmt.Sprintf("relate_typed: unknown lineage type %q — the closed set is EVIDENCES, SUPERSEDES, CAUSED_BY, DERIVED_FROM, INVALIDATES", relType))
	}
	from, err := h.store.GetLearning(int64(fromID))
	if err != nil {
		return errorResponse("relate_typed: no learning with from_id")
	}
	to, err := h.store.GetLearning(int64(toID))
	if err != nil {
		return errorResponse("relate_typed: no learning with to_id")
	}
	if from.Project != to.Project {
		return errorResponse(fmt.Sprintf("relate_typed: rows live in different projects (%q vs %q) — lineage does not cross project scopes", from.Project, to.Project))
	}
	assoc := &models.Association{
		SourceType: "learning", SourceID: fmt.Sprintf("%d", int64(fromID)),
		TargetType: "learning", TargetID: fmt.Sprintf("%d", int64(toID)),
		Weight: 1.0, RelationType: relType,
	}
	if err := h.store.UpsertAssociation(assoc); err != nil {
		return errorResponse(fmt.Sprintf("relate_typed: %v", err))
	}
	if err := h.store.RecordCapEvent("lineage.typed", from.Project,
		fmt.Sprintf("learning %d %s learning %d", int64(fromID), relType, int64(toID))); err != nil {
		return errorResponse(fmt.Sprintf("relate_typed: %v", err))
	}
	return jsonResponse(map[string]any{"related": true, "type": relType})
}
