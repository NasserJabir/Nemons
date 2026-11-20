package daemon

// Evidence and experience (ladder stage 8): an execution produces traceable
// evidence and a validated experience available to subsequent runs. The
// foundation document draws two hard lines. Evidence-based learning (14.4):
// a failed run does not automatically justify changing a skill or knowledge
// asset — a failure is only learnable once attributed to one of the eight
// causes (MODEL, HARNESS, SKILL, KNOWLEDGE, TOOL, POLICY, ENVIRONMENT,
// UNKNOWN) and backed by recorded evidence. Controlled evolution (14.5):
// experiences never modify assets by themselves — validation annotates the
// experience row, nothing else.

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
	"github.com/NasserJabir/Nemons/internal/storage"
)

// ExperienceAttributions is the closed failure-attribution set (14.4).
// UNKNOWN is a legal, explicit attribution — the summary surfaces it as such
// instead of silently guessing a cause.
var ExperienceAttributions = map[string]bool{
	"MODEL": true, "HARNESS": true, "SKILL": true, "KNOWLEDGE": true,
	"TOOL": true, "POLICY": true, "ENVIRONMENT": true, "UNKNOWN": true,
}

// ExperienceMeta rides in the row's Context field, the same pattern the caps
// use (CapMeta): a structured envelope inside a governed learning row, so
// scope, supersede, and the live reads all apply unchanged.
type ExperienceMeta struct {
	Outcome     string `json:"outcome"`     // success | failure
	Attribution string `json:"attribution"` // one of the eight, failures only
	Evidence    string `json:"evidence"`    // what was observed, where
	Claim       string `json:"claim"`       // optional claim this evidence supports
	Validated   bool   `json:"validated"`   // set by validate_experience only
	Validator   string `json:"validator,omitempty"`
	ValidatedAt string `json:"validated_at,omitempty"`
}

func ParseExperienceMeta(raw string) (ExperienceMeta, error) {
	var m ExperienceMeta
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return m, err
	}
	return m, nil
}

func (h *Handler) handleLogExperience(params map[string]any) Response {
	task, _ := params["task"].(string)
	project, _ := params["project"].(string)
	outcome, _ := params["outcome"].(string)
	attribution, _ := params["attribution"].(string)
	evidence, _ := params["evidence"].(string)
	claim, _ := params["claim"].(string)
	if task == "" || project == "" {
		return errorResponse("log_experience: 'task' and 'project' are required")
	}
	if outcome != "success" && outcome != "failure" {
		return errorResponse("log_experience: outcome must be success or failure")
	}
	// Evidence-based learning (14.4): a failure is only learnable with a
	// recorded cause and recorded evidence. A bare "it failed" is not an
	// experience the system may learn from.
	if outcome == "failure" {
		if !ExperienceAttributions[attribution] {
			return errorResponse("log_experience: a failure needs an attribution from the closed set (MODEL/HARNESS/SKILL/KNOWLEDGE/TOOL/POLICY/ENVIRONMENT/UNKNOWN)")
		}
		if len([]rune(evidence)) == 0 {
			return errorResponse("log_experience: a failure needs recorded evidence — what was observed and where")
		}
	}
	if attribution != "" && outcome == "success" {
		return errorResponse("log_experience: a success carries no attribution — attribution explains failures only")
	}
	meta := ExperienceMeta{
		Outcome: outcome, Attribution: attribution, Evidence: evidence, Claim: claim,
	}
	raw, err := json.Marshal(meta)
	if err != nil {
		return errorResponse(fmt.Sprintf("log_experience: %v", err))
	}
	caller, _ := params["_source_agent"].(string)
	scope, _ := params["sharing_scope"].(string)
	if scope == "" {
		scope = "project"
	}
	if scope == "private" && caller == "" {
		return errorResponse("log_experience: a private row needs the caller it belongs to (_source_agent); nothing was saved")
	}
	row := &models.Learning{
		Category: "experience", Content: task, Project: project,
		Context: string(raw), CreatedAt: time.Now(), ModelUsed: "nemons",
		SourceAgent: caller, SharingScope: scope,
	}
	if _, err := h.store.InsertLearning(row); err != nil {
		return errorResponse(fmt.Sprintf("log_experience: %v", err))
	}
	if err := h.store.RecordCapEvent("experience.logged", project,
		fmt.Sprintf("task %q: %s", truncateForAudit(task, 60), outcome)); err != nil {
		return errorResponse(fmt.Sprintf("log_experience: %v", err))
	}
	return jsonResponse(map[string]any{"logged": true, "outcome": outcome})
}

func (h *Handler) handleValidateExperience(params map[string]any) Response {
	id, _ := params["id"].(float64)
	validator, _ := params["_source_agent"].(string)
	reject, _ := params["reject"].(bool)
	if id == 0 {
		return errorResponse("validate_experience: 'id' is required")
	}
	row, err := h.store.GetLearning(int64(id))
	if err != nil || row.Category != "experience" {
		return errorResponse("validate_experience: no experience row with that id")
	}
	meta, err := ParseExperienceMeta(row.Context)
	if err != nil {
		return errorResponse(fmt.Sprintf("validate_experience: %v", err))
	}
	// Validation is evidence-checking, not belief: an experience with no
	// recorded evidence cannot be validated for reuse.
	if !reject && len([]rune(meta.Evidence)) == 0 {
		return errorResponse("validate_experience: the experience carries no evidence — nothing to validate")
	}
	meta.Validated = !reject
	meta.Validator = validator
	meta.ValidatedAt = time.Now().UTC().Format(time.RFC3339)
	raw, err := json.Marshal(meta)
	if err != nil {
		return errorResponse(fmt.Sprintf("validate_experience: %v", err))
	}
	if err := h.store.UpdateLearningContext(int64(id), string(raw)); err != nil {
		return errorResponse(fmt.Sprintf("validate_experience: %v", err))
	}
	kind := "experience.validated"
	if reject {
		kind = "experience.rejected"
	}
	if err := h.store.RecordCapEvent(kind, row.Project, fmt.Sprintf("id %d by %s", int64(id), validator)); err != nil {
		return errorResponse(fmt.Sprintf("validate_experience: %v", err))
	}
	return jsonResponse(map[string]any{"id": int64(id), "validated": meta.Validated})
}

func (h *Handler) handleGetExperienceSummary(params map[string]any) Response {
	project, _ := params["project"].(string)
	if project == "" {
		return errorResponse("get_experience_summary: 'project' is required")
	}
	viewer, _ := params["_source_agent"].(string)
	rows, err := h.store.GetActiveLearningsFiltered(storage.LearningsFilter{Project: project, Viewer: viewer}, 0)
	if err != nil {
		return errorResponse(fmt.Sprintf("get_experience_summary: %v", err))
	}
	success, failures := 0, 0
	byAttribution := map[string]int{}
	validated := 0
	type entry struct {
		ID          int64  `json:"id"`
		Task        string `json:"task"`
		Attribution string `json:"attribution"`
		Validated   bool   `json:"validated"`
	}
	var recent []entry
	for i := range rows {
		if rows[i].Category != "experience" {
			continue
		}
		meta, err := ParseExperienceMeta(rows[i].Context)
		if err != nil {
			continue
		}
		if meta.Outcome == "success" {
			success++
		} else {
			failures++
			byAttribution[meta.Attribution]++
			if len(recent) < 10 {
				recent = append(recent, entry{ID: rows[i].ID, Task: rows[i].Content,
					Attribution: meta.Attribution, Validated: meta.Validated})
			}
		}
		if meta.Validated {
			validated++
		}
	}
	return jsonResponse(map[string]any{
		"project": project, "success": success, "failure": failures,
		"by_attribution": byAttribution, "validated": validated,
		"recent_failures": recent,
	})
}
