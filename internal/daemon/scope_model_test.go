package daemon

// The canonical sharing-model matrix (remediation WS-C): the legacy 'public'
// vocabulary migrates to 'global' without widening access, ownership and
// lifecycle never move with a scope value, unknown scopes fail closed on
// write, and global writes are operator-authorized (the memory.public_write
// standing grant) — never implicitly promoted.

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
	"github.com/NasserJabir/Nemons/internal/storage"
)

func modelsLearningsFilterFor(viewer string) storage.LearningsFilter {
	return storage.LearningsFilter{Project: "/w", Viewer: viewer}
}

func TestNormalizeSharingScope_Matrix(t *testing.T) {
	cases := map[string]string{
		"":         models.ScopeProject, // legacy default stays project-shared
		"project":  models.ScopeProject,
		"private":  models.ScopePrivate,
		"public":   models.ScopeGlobal, // legacy vocabulary
		"global":   models.ScopeGlobal,
		"weird":    "", // unknown: every write path must refuse
		"PRIVATE":  "", // the scope value is not the agent label: case-sensitive by contract
	}
	for in, want := range cases {
		if got := models.NormalizeSharingScope(in); got != want {
			t.Errorf("NormalizeSharingScope(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestScopeMigration_RewritesPublicWithoutWideningAccess(t *testing.T) {
	_, s := mustFileHandler(t)
	now := time.Now().Add(-48 * time.Hour)
	// Seed the legacy vocabulary directly: 'public' (published) and 'private'.
	for _, row := range []struct{ id int64; content, scope, owner string }{
		{1, "published runbook everyone", "public", "alice"},
		{2, "alice private secret-xyz", "private", "alice"},
	} {
		if _, err := s.InsertLearning(&models.Learning{
			ID: row.id, Category: "decision", Content: row.content, Project: "/w",
			SourceAgent: row.owner, SharingScope: row.scope, ModelUsed: "matrix", CreatedAt: now,
		}); err != nil {
			t.Fatalf("seed %d: %v", row.id, err)
		}
	}

	// The migration is part of Open; run it explicitly here for the seeded
	// rows and prove it is idempotent.
	if err := s.MigrateSharingScopesForTest(); err != nil {
		t.Fatalf("migration: %v", err)
	}
	var publicScope string
	if err := s.DB().QueryRow(`SELECT scope FROM learnings WHERE id = 1`).Scan(&publicScope); err != nil {
		t.Fatal(err)
	}
	if publicScope != models.ScopeGlobal {
		t.Fatalf("legacy row scope = %q, want canonical %q", publicScope, models.ScopeGlobal)
	}

	// Access preserved: the published row stays readable by every viewer; the
	// private row stays owner-only.
	for _, viewer := range []string{"alice", "bob", "carol"} {
		rows, err := s.GetActiveLearningsFiltered(modelsLearningsFilterFor(viewer), 0)
		if err != nil {
			t.Fatalf("viewer %s read: %v", viewer, err)
		}
		sawPublished, sawPrivate := false, false
		for _, l := range rows {
			switch l.ID {
			case 1:
				sawPublished = true
			case 2:
				sawPrivate = true
			}
		}
		if !sawPublished {
			t.Errorf("viewer %s lost the published row after migration", viewer)
		}
		// The private row stays owner-only: alice reads her own row, the
		// others read it as absent — exactly as before the migration.
		wantPrivate := viewer == "alice"
		if sawPrivate != wantPrivate {
			t.Errorf("viewer %s private visibility = %v, want %v", viewer, sawPrivate, wantPrivate)
		}
	}
}

func TestRemember_GlobalScopeRequiresTheStandingGrant(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"content": "published everywhere claim", "project": "/w",
		"scope": "global", "_source_agent": "claude", "_source_agent_source": "resolved",
	}})
	if resp.Error == "" || !strings.Contains(resp.Error, "memory.public_write grant") {
		t.Fatalf("a global write without the standing grant was accepted: %v", resp.Error)
	}
}

func TestRemember_UnknownScopeStillRefused(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"content": "x", "project": "/w", "scope": "team", "_source_agent": "claude", "_source_agent_source": "resolved",
	}})
	if resp.Error == "" || !strings.Contains(resp.Error, "unknown sharing scope") {
		t.Fatalf("an unknown scope was accepted: %v", resp.Error)
	}
}

func TestRemember_DefaultStaysProjectNoImplicitPromotion(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.Handle(Request{Method: "remember", Params: map[string]any{
		"content": "ordinary claim", "project": "/w", "_source_agent": "claude", "_source_agent_source": "resolved",
	}})
	if resp.Error != "" {
		t.Fatalf("ordinary remember refused: %v", resp.Error)
	}
	// Read the row back by the id the response names — not by the raw content,
	// which the sanitizer may re-shape.
	var saved struct {
		ID float64 `json:"id"`
	}
	_ = json.Unmarshal(resp.Result, &saved)
	if saved.ID == 0 {
		t.Fatalf("remember returned no id: %.200s", string(resp.Result))
	}
	var scope string
	if err := s.DB().QueryRow(`SELECT COALESCE(scope,'') FROM learnings WHERE id = ?`, int64(saved.ID)).Scan(&scope); err != nil {
		t.Fatal(err)
	}
	if scope != "" && scope != models.ScopeProject {
		t.Fatalf("default scope = %q, want the project-shared default — implicit promotion", scope)
	}
}
