package daemon

// Evaluation and learning (ladder stage 10). Two documented pieces make up
// this stage. The TokenEconomizer adoption: citation verification as a gate
// in the extraction line — a stored claim that names a source file can be
// checked against the real bytes (sha256), so unverifiable knowledge never
// survives quietly. The evaluation substrate (F-031/F-036/F-038/F-039):
// golden task results with the first result as the per-task baseline, and
// the token-economy read that surfaces knowledge which pays its injection
// cost without ever being used. Nothing here modifies assets automatically
// (14.5): the summaries read and surface, the governance gate decides.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
	"github.com/NasserJabir/Nemons/internal/storage"
)

// handleVerifyCitation checks a stored citation against the actual source
// bytes. The path must live inside the row's project scope — a citation is
// project evidence, not a fetch-anywhere key. A first verification with no
// stored hash records the computed one; a mismatch is audited, never fixed.
func (h *Handler) handleVerifyCitation(params map[string]any) Response {
	id, _ := params["id"].(float64)
	if id == 0 {
		return errorResponse("verify_citation: 'id' is required")
	}
	row, err := h.store.GetLearning(int64(id))
	if err != nil {
		return errorResponse("verify_citation: no learning with that id")
	}
	if row.SourceFile == "" {
		return errorResponse("verify_citation: the row carries no citation (source_file) to verify")
	}
	path := row.SourceFile
	base := row.Project
	if base == "" {
		base = row.CanonicalProject
	}
	if base != "" && !strings.HasPrefix(path, base) {
		return errorResponse(fmt.Sprintf("verify_citation: %q lies outside the row's project scope %q", path, base))
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return errorResponse(fmt.Sprintf("verify_citation: the cited file is not readable: %v", err))
	}
	sum := sha256.Sum256(data)
	computed := hex.EncodeToString(sum[:])
	if row.SourceHash == "" {
		if err := h.store.UpdateLearningSourceHash(int64(id), computed); err != nil {
			return errorResponse(fmt.Sprintf("verify_citation: %v", err))
		}
		if err := h.store.RecordCapEvent("citation.verified", row.Project,
			fmt.Sprintf("id %d: hash recorded for %s", int64(id), path)); err != nil {
			return errorResponse(fmt.Sprintf("verify_citation: %v", err))
		}
		return jsonResponse(map[string]any{"id": int64(id), "verified": true, "hash_recorded": true})
	}
	if computed != row.SourceHash {
		if err := h.store.RecordCapEvent("citation.mismatch", row.Project,
			fmt.Sprintf("id %d: stored hash does not match the cited file", int64(id))); err != nil {
			return errorResponse(fmt.Sprintf("verify_citation: %v", err))
		}
		return jsonResponse(map[string]any{"id": int64(id), "verified": false, "reason": "hash mismatch"})
	}
	if err := h.store.RecordCapEvent("citation.verified", row.Project,
		fmt.Sprintf("id %d: citation matches the cited file", int64(id))); err != nil {
		return errorResponse(fmt.Sprintf("verify_citation: %v", err))
	}
	return jsonResponse(map[string]any{"id": int64(id), "verified": true})
}

// GoldenMeta rides in the Context field of golden rows, the CapMeta pattern.
type GoldenMeta struct {
	TaskID     string `json:"task_id"`
	Passed     bool   `json:"passed"`
	CostTokens int64  `json:"cost_tokens,omitempty"`
	DurationMS int64  `json:"duration_ms,omitempty"`
}

func parseGoldenMeta(raw string) (GoldenMeta, error) {
	var m GoldenMeta
	err := json.Unmarshal([]byte(raw), &m)
	return m, err
}

// handleRecordGoldenResult stores one golden-task run (F-038). The first
// recorded result for a task becomes its baseline (F-036); later results
// compare against it in the summary. Recording is evidence, not judgement —
// a pass does not prove correctness (14.4).
func (h *Handler) handleRecordGoldenResult(params map[string]any) Response {
	taskID, _ := params["task_id"].(string)
	project, _ := params["project"].(string)
	passed, _ := params["passed"].(bool)
	if taskID == "" || project == "" {
		return errorResponse("record_golden_result: 'task_id' and 'project' are required")
	}
	cost, _ := params["cost_tokens"].(float64)
	dur, _ := params["duration_ms"].(float64)
	meta := GoldenMeta{TaskID: taskID, Passed: passed,
		CostTokens: int64(cost), DurationMS: int64(dur)}
	raw, err := json.Marshal(meta)
	if err != nil {
		return errorResponse(fmt.Sprintf("record_golden_result: %v", err))
	}
	row := &models.Learning{
		Category: "golden", Content: taskID, Project: project,
		Context: string(raw), CreatedAt: time.Now(), ModelUsed: "nemons",
		SharingScope: "",
	}
	id, err := h.store.InsertLearning(row)
	if err != nil {
		return errorResponse(fmt.Sprintf("record_golden_result: %v", err))
	}
	row.ID = id
	if err := h.store.RecordCapEvent("golden.recorded", project,
		fmt.Sprintf("task %s: %s", taskID, passedOrFailed(passed))); err != nil {
		return errorResponse(fmt.Sprintf("record_golden_result: %v", err))
	}
	// Baseline = the first recorded row for this task (F-036). If any other
	// row for the same task exists, this run is a comparison, not the base.
	baselineExists := false
	existing, err := h.store.GetActiveLearnings("golden", project, "", "", 0)
	if err == nil {
		for i := range existing {
			if m, err := parseGoldenMeta(existing[i].Context); err == nil &&
				m.TaskID == taskID && existing[i].ID != row.ID {
				baselineExists = true
				break
			}
		}
	}
	resp := map[string]any{"recorded": true, "task_id": taskID, "passed": passed}
	if !baselineExists {
		resp["baseline"] = true
	}
	return jsonResponse(resp)
}

func passedOrFailed(p bool) string {
	if p {
		return "passed"
	}
	return "failed"
}

// handleGetEvaluationSummary reads the evaluation substrate through the
// caller's scope view: per-golden-task tallies against the baseline, and the
// token economy of live knowledge — what gets injected, what actually gets
// used, and the idle rows paying cost with no return. Read-only by design:
// no automatic supersede, no automatic retirement (14.5).
func (h *Handler) handleGetEvaluationSummary(params map[string]any) Response {
	project, _ := params["project"].(string)
	if project == "" {
		return errorResponse("get_evaluation_summary: 'project' is required")
	}
	viewer := h.actorViewerOrDefault(params, "get_evaluation_summary")
	rows, err := h.store.GetActiveLearningsFiltered(storage.LearningsFilter{
		Project: project, Viewer: viewer,
	}, 0)
	if err != nil {
		return errorResponse(fmt.Sprintf("get_evaluation_summary: %v", err))
	}

	type taskTally struct {
		TaskID         string `json:"task_id"`
		Runs           int    `json:"runs"`
		Passes         int    `json:"passes"`
		BaselinePassed bool   `json:"baseline_passed"`
		LastPassed     bool   `json:"last_passed"`
	}
	tallies := map[string]*taskTally{}
	var order []string
	idle := []map[string]any{}
	injected, used := 0, 0
	for i := range rows {
		r := rows[i]
		switch r.Category {
		case "golden":
			m, err := parseGoldenMeta(r.Context)
			if err != nil {
				continue
			}
			t, ok := tallies[m.TaskID]
			if !ok {
				t = &taskTally{TaskID: m.TaskID, BaselinePassed: m.Passed}
				tallies[m.TaskID] = t
				order = append(order, m.TaskID)
			}
			t.Runs++
			if m.Passed {
				t.Passes++
			}
			t.LastPassed = m.Passed
		case "gotcha", "decision", "explicit_teaching":
			if r.InjectCount > 0 {
				injected++
				if r.UseCount > 0 {
					used++
				} else {
					idle = append(idle, map[string]any{
						"id": r.ID, "category": r.Category,
						"injections": r.InjectCount,
					})
				}
			}
		}
	}
	sort.Slice(idle, func(a, b int) bool {
		return idle[a]["injections"].(int64) > idle[b]["injections"].(int64)
	})
	tasks := make([]*taskTally, 0, len(order))
	for _, id := range order {
		tasks = append(tasks, tallies[id])
	}
	return jsonResponse(map[string]any{
		"project": project,
		"golden_tasks": tasks,
		"token_economy": map[string]any{
			"injected": injected, "used": used, "idle": idle,
		},
	})
}
