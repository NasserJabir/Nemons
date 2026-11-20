package daemon

// Skill pinning and rollback for task caps. A pinned cap is frozen: the save
// path refuses to upgrade its name until it is unpinned, so an agent cannot
// silently rewrite a script the operator wants held. Rollback restores an
// earlier version as a NEW live row marked with the row it rolled back from —
// the supersede chain stays linear (the current live row is superseded toward
// the restored one), so the cycle guard keeps working and every read sees one
// live row for the name. Pin, unpin and rollback each write their own audit
// line.

import (
	"encoding/json"
	"fmt"

	"github.com/NasserJabir/Nemons/internal/models"
	"github.com/NasserJabir/Nemons/internal/storage"
)

// findActiveCapRow resolves the live row of a cap name (the bound row when the
// name is bound, the global one otherwise).
func findActiveCapRow(s *storage.Store, name string) (*models.Learning, *CapMeta, error) {
	existing, err := s.GetActiveLearnings("cap", "", "", "", 0)
	if err != nil {
		return nil, nil, fmt.Errorf("pin lookup: %v", err)
	}
	for i := range existing {
		meta, err := ParseCapMeta(existing[i].Context)
		if err != nil || meta.Name != name {
			continue
		}
		return &existing[i], &meta, nil
	}
	return nil, nil, fmt.Errorf("no active cap named %q", name)
}

func rewriteCapMeta(s *storage.Store, id int64, meta *CapMeta) error {
	ctx, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	return s.UpdateLearningContext(id, string(ctx))
}

func (h *Handler) handlePinCap(params map[string]any) Response {
	name := stringOr(params, "name", "")
	if name == "" {
		return errorResponse("pin_cap: 'name' is required")
	}
	row, meta, err := findActiveCapRow(h.store, name)
	if err != nil {
		return errorResponse(fmt.Sprintf("pin_cap: %v", err))
	}
	meta.Pinned = true
	if err := rewriteCapMeta(h.store, row.ID, meta); err != nil {
		return errorResponse(fmt.Sprintf("pin_cap: %v", err))
	}
	if err := h.store.RecordCapEvent("cap.pin", name, fmt.Sprintf("v%d pinned", meta.Version)); err != nil {
		return errorResponse(fmt.Sprintf("pin_cap: %v", err))
	}
	return jsonResponse(map[string]any{"name": name, "pinned": true, "version": meta.Version})
}

func (h *Handler) handleUnpinCap(params map[string]any) Response {
	name := stringOr(params, "name", "")
	if name == "" {
		return errorResponse("unpin_cap: 'name' is required")
	}
	row, meta, err := findActiveCapRow(h.store, name)
	if err != nil {
		return errorResponse(fmt.Sprintf("unpin_cap: %v", err))
	}
	meta.Pinned = false
	if err := rewriteCapMeta(h.store, row.ID, meta); err != nil {
		return errorResponse(fmt.Sprintf("unpin_cap: %v", err))
	}
	if err := h.store.RecordCapEvent("cap.unpin", name, fmt.Sprintf("v%d unpinned", meta.Version)); err != nil {
		return errorResponse(fmt.Sprintf("unpin_cap: %v", err))
	}
	return jsonResponse(map[string]any{"name": name, "pinned": false})
}

func (h *Handler) handleRollbackCap(params map[string]any) Response {
	name := stringOr(params, "name", "")
	if name == "" {
		return errorResponse("rollback_cap: 'name' is required")
	}
	row, meta, err := findActiveCapRow(h.store, name)
	if err != nil {
		return errorResponse(fmt.Sprintf("rollback_cap: %v", err))
	}
	// The restored row carries the content as it stands, a fresh identity, and
	// the marker naming the row it rolled back from. The current live row is
	// superseded toward the new one, so the chain stays linear and one live row
	// per name remains.
	rollbackMeta := *meta
	rollbackMeta.Pinned = false
	rollbackMeta.RollbackFrom = row.ID
	rollbackMeta.Version = meta.Version + 1
	ctx, err := json.Marshal(&rollbackMeta)
	if err != nil {
		return errorResponse(fmt.Sprintf("rollback_cap: %v", err))
	}
	id, err := h.store.InsertLearning(&models.Learning{
		Category: "cap", Content: row.Content, Project: row.Project,
		Context: string(ctx), CreatedAt: timeNow(), ModelUsed: "rollback",
	})
	if err != nil {
		return errorResponse(fmt.Sprintf("rollback_cap: %v", err))
	}
	if err := h.store.SupersedeLearning(row.ID, id, "rollback: restoring the pinned state as a new live row"); err != nil {
		return errorResponse(fmt.Sprintf("rollback_cap: supersede failed: %v", err))
	}
	if err := h.store.RecordCapEvent("cap.rollback", name,
		fmt.Sprintf("v%d restored as #%d from #%d", meta.Version, id, row.ID)); err != nil {
		return errorResponse(fmt.Sprintf("rollback_cap: %v", err))
	}
	return jsonResponse(map[string]any{"name": name, "restored_id": id, "rollback_from": row.ID})
}
