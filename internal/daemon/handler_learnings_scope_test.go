package daemon

// The remember-side sharing policy: the raw value is judged before any
// normalization, unknown scopes are refused fail-closed, a private row needs
// the caller it belongs to, a public row needs the memory.public_write grant,
// and cap rows stay shared whatever the caller asked for.

import (
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
	"github.com/NasserJabir/Nemons/internal/storage"
)

func rememberRows(t *testing.T, h *Handler, viewer string) []models.Learning {
	t.Helper()
	rows, err := h.store.GetActiveLearningsFiltered(storage.LearningsFilter{Viewer: viewer}, 0)
	if err != nil {
		t.Fatalf("read as %q: %v", viewer, err)
	}
	return rows
}

func containsLearning(rows []models.Learning, content string) bool {
	for _, l := range rows {
		if l.Content == content {
			return true
		}
	}
	return false
}

func TestRememberScopeDefaultsShared(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "shared by default", "project": "/w", "_source_agent": "claude"}})
	if resp.Error != "" {
		t.Fatalf("remember: %v", resp.Error)
	}
	for _, viewer := range []string{"claude", "codex"} {
		if !containsLearning(rememberRows(t, h, viewer), "shared by default") {
			t.Errorf("viewer %s lost the default-shared row", viewer)
		}
	}
}

func TestRememberPrivateNeedsTheCallerItBelongsTo(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "orphan private", "project": "/w", "scope": "private"}})
	if resp.Error == "" {
		t.Fatal("a private row without a described caller was accepted")
	}
	if !strings.Contains(resp.Error, "private row needs the caller") {
		t.Errorf("refusal = %q, want the caller requirement", resp.Error)
	}
	if n, _ := s.OpenApprovalCount(); n != 0 {
		t.Log("note: governance rows exist from the gate for this governed method")
	}
	if rows := rememberRows(t, h, ""); len(rows) != 0 {
		t.Errorf("the refused write landed anyway: %+v", rows)
	}
}

func TestRememberPrivateWithCallerStoredAndHiddenFromOthers(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "claude only", "project": "/w", "scope": "private", "_source_agent": "claude"}})
	if resp.Error != "" {
		t.Fatalf("remember: %v", resp.Error)
	}
	if !containsLearning(rememberRows(t, h, "claude"), "claude only") {
		t.Error("claude lost its own private row")
	}
	if containsLearning(rememberRows(t, h, "codex"), "claude only") {
		t.Error("codex saw claude's private row")
	}
}

func TestRememberUnknownScopeRefused(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "team scope?", "project": "/w", "scope": "team", "_source_agent": "claude"}})
	if resp.Error == "" {
		t.Fatal("an unknown scope value was accepted")
	}
	for _, want := range []string{"project", "private", "global"} {
		if !strings.Contains(resp.Error, want) {
			t.Errorf("refusal %q does not name the valid value %q", resp.Error, want)
		}
	}
	if rows := rememberRows(t, h, ""); len(rows) != 0 {
		t.Errorf("the refused write landed anyway: %+v", rows)
	}
}

func TestRememberPublicNeedsTheGrant(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "publish me", "project": "/w", "scope": "global", "_source_agent": "claude"}})
	if resp.Error == "" {
		t.Fatal("a public write passed without the grant")
	}
	if !strings.Contains(resp.Error, "memory.public_write") {
		t.Errorf("refusal = %q, want the grant name", resp.Error)
	}
	if rows := rememberRows(t, h, ""); len(rows) != 0 {
		t.Errorf("the refused write landed anyway: %+v", rows)
	}
	// The grant is a standing allow on its own key, fail-closed: absent means
	// refused, and the refusal above named the ask.
	key := storage.GateKey("memory.public_write", nil)
	if _, err := s.RequestApproval(key, "memory.public_write", "operator", "agent", time.Minute); err != nil {
		t.Fatalf("open grant ask: %v", err)
	}
	if err := s.DecideApproval(key, storage.ApprovalAllow, "operator"); err != nil {
		t.Fatalf("allow grant: %v", err)
	}
	resp = h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "publish me", "project": "/w", "scope": "global", "_source_agent": "claude"}})
	if resp.Error != "" {
		t.Fatalf("granted public write refused: %v", resp.Error)
	}
	for _, viewer := range []string{"codex", "opencode"} {
		if !containsLearning(rememberRows(t, h, viewer), "publish me") {
			t.Errorf("viewer %s lost the published row", viewer)
		}
	}
}

func TestRememberCapRowsStayShared(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "a cap note", "category": "cap", "project": "/w", "scope": "private", "_source_agent": "claude"}})
	if resp.Error != "" {
		t.Fatalf("remember cap: %v", resp.Error)
	}
	rows, err := h.store.GetLearningForViewer(1, "codex")
	if err != nil {
		t.Fatalf("codex read the cap row: %v", err)
	}
	if rows.SharingScope != "" {
		t.Errorf("cap row scope = %q, want the shared default", rows.SharingScope)
	}
}

func TestRememberCannotSupersedeAnotherAgentsPrivateRow(t *testing.T) {
	h, _ := mustHandler(t)
	seed := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "claude secret", "project": "/w", "scope": "private", "_source_agent": "claude"}})
	if seed.Error != "" {
		t.Fatalf("seed remember: %v", seed.Error)
	}
	rows := rememberRows(t, h, "claude")
	var id float64
	for _, l := range rows {
		if l.Content == "claude secret" {
			id = float64(l.ID)
		}
	}
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"text": "codex retires it", "project": "/w", "supersedes": id,
		"_source_agent": "codex"}})
	if resp.Error == "" {
		t.Fatal("codex superseded claude's private row")
	}
	if !strings.Contains(resp.Error, "could not be loaded") {
		t.Errorf("refusal = %q, want the not-found shape (existence unconfirmed)", resp.Error)
	}
}
