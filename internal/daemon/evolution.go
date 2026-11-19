package daemon

// Controlled evolution (ladder stage 10+, closing the last two documented
// gaps). F-057 dependency invalidation for citations: knowledge that cites a
// source file is checked against the real bytes — a source that changed or
// vanished makes its dependents stale, and stale knowledge is audited so the
// governance gate can supersede it. Nothing is auto-superseded (14.5).
// F-042 the proposal loop: a validated failure attributed to an asset becomes
// a governance ask — a proposal awaiting review, never a direct change.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/carsteneu/yesmem/internal/storage"
)

// handleCheckCitations walks every cited row in a project through the
// caller's scope view and compares the stored hash with the source bytes.
// Missing source and hash mismatch are dependency invalidation (F-057): the
// dependents are flagged stale in the audit log, not deleted or rewritten.
func (h *Handler) handleCheckCitations(params map[string]any) Response {
	project, _ := params["project"].(string)
	if project == "" {
		return errorResponse("check_citations: 'project' is required")
	}
	viewer, _ := params["_source_agent"].(string)
	rows, err := h.store.GetActiveLearningsFiltered(storage.LearningsFilter{
		Project: project, Viewer: viewer,
	}, 0)
	if err != nil {
		return errorResponse(fmt.Sprintf("check_citations: %v", err))
	}
	fresh, stale := 0, 0
	staleRows := []map[string]any{}
	for i := range rows {
		r := rows[i]
		if r.SourceFile == "" {
			continue
		}
		base := r.Project
		if base == "" {
			base = r.CanonicalProject
		}
		if base != "" && !strings.HasPrefix(r.SourceFile, base) {
			continue
		}
		data, err := os.ReadFile(r.SourceFile)
		if err != nil {
			stale++
			staleRows = append(staleRows, map[string]any{
				"id": r.ID, "reason": "source unreadable", "source_file": r.SourceFile})
			if err := h.store.RecordCapEvent("citation.stale", project,
				fmt.Sprintf("id %d: source unreadable (%s)", r.ID, r.SourceFile)); err != nil {
				return errorResponse(fmt.Sprintf("check_citations: %v", err))
			}
			continue
		}
		sum := sha256.Sum256(data)
		computed := hex.EncodeToString(sum[:])
		if r.SourceHash != "" && computed != r.SourceHash {
			stale++
			staleRows = append(staleRows, map[string]any{
				"id": r.ID, "reason": "hash mismatch", "source_file": r.SourceFile})
			if err := h.store.RecordCapEvent("citation.stale", project,
				fmt.Sprintf("id %d: source changed since verification", r.ID)); err != nil {
				return errorResponse(fmt.Sprintf("check_citations: %v", err))
			}
			continue
		}
		fresh++
	}
	return jsonResponse(map[string]any{
		"project": project, "fresh": fresh, "stale": stale,
		"stale_rows": staleRows,
	})
}

// assetAttributions are the failure causes that point at a governed asset.
// A failure attributed to MODEL or ENVIRONMENT has no asset to propose a
// change for; UNKNOWN names nothing; the three asset causes do.
var assetAttributions = map[string]bool{
	"SKILL": true, "KNOWLEDGE": true, "POLICY": true,
}

// handleProposeFromExperience converts a validated, evidence-backed failure
// attributed to an asset into a governance ask (F-042/F-043): a proposal
// awaiting review. Creating the ask changes nothing — the gate decides,
// exactly as the foundation document requires for controlled evolution.
func (h *Handler) handleProposeFromExperience(params map[string]any) Response {
	id, _ := params["id"].(float64)
	target, _ := params["target"].(string)
	caller, _ := params["_source_agent"].(string)
	if id == 0 {
		return errorResponse("propose_from_experience: 'id' is required")
	}
	if target == "" {
		return errorResponse("propose_from_experience: 'target' names the asset the change touches (e.g. a cap name)")
	}
	row, err := h.store.GetLearning(int64(id))
	if err != nil || row.Category != "experience" {
		return errorResponse("propose_from_experience: no experience row with that id")
	}
	meta, err := ParseExperienceMeta(row.Context)
	if err != nil {
		return errorResponse(fmt.Sprintf("propose_from_experience: %v", err))
	}
	if meta.Outcome != "failure" || !assetAttributions[meta.Attribution] {
		return errorResponse("propose_from_experience: only failures attributed to an asset (SKILL/KNOWLEDGE/POLICY) can propose a change")
	}
	if !meta.Validated {
		return errorResponse("propose_from_experience: the experience is not validated — validate it first; an unvalidated failure is not a proposal")
	}
	if len([]rune(meta.Evidence)) == 0 {
		return errorResponse("propose_from_experience: the experience carries no evidence — nothing to review")
	}
	key := storage.GateKey("experience.proposal", map[string]any{
		"id": fmt.Sprintf("%d", int64(id)), "target": target,
	})
	if existing, err := h.store.ApprovalForKey(key); err == nil && existing != nil {
		return jsonResponse(map[string]any{
			"proposed": true, "key": key, "status": string(existing.Status),
			"note": "an ask for this proposal already exists",
		})
	}
	askID, err := h.store.RequestApproval(key, "propose_from_experience", caller, "daemon", 72*time.Hour)
	if err != nil {
		return errorResponse(fmt.Sprintf("propose_from_experience: %v", err))
	}
	if err := h.store.RecordCapEvent("experience.proposed", row.Project,
		fmt.Sprintf("experience %d proposes a change to %q — ask %s", int64(id), target, key)); err != nil {
		return errorResponse(fmt.Sprintf("propose_from_experience: %v", err))
	}
	return jsonResponse(map[string]any{
		"proposed": true, "key": key, "ask_id": askID, "target": target,
	})
}
