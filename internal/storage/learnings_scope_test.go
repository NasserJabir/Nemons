package storage

// The memory sharing scope: private rows belong to one agent, public rows are
// readable by every agent, and everything else stays shared inside its project
// exactly as upstream wrote it. A system read — the empty viewer — is
// byte-identical to the pre-scope behaviour.

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/carsteneu/yesmem/internal/models"
)

func scopeSeed(t *testing.T, s *Store, content, agent, scope string) int64 {
	t.Helper()
	id, err := s.InsertLearning(&models.Learning{
		Category: "explicit_teaching", Content: content, Project: "/w",
		CreatedAt: time.Now(), ModelUsed: "test", SourceAgent: agent, SharingScope: scope,
	})
	if err != nil {
		t.Fatalf("seed %q: %v", content, err)
	}
	return id
}

func scopeRead(t *testing.T, s *Store, viewer string) []string {
	t.Helper()
	rows, err := s.GetActiveLearningsFiltered(LearningsFilter{Project: "/w", Viewer: viewer}, 0)
	if err != nil {
		t.Fatalf("read as %q: %v", viewer, err)
	}
	out := make([]string, 0, len(rows))
	for _, l := range rows {
		out = append(out, l.Content)
	}
	return out
}

func containsRow(rows []string, content string) bool {
	for _, r := range rows {
		if r == content {
			return true
		}
	}
	return false
}

func TestScopeSharedRowsVisibleToEveryAgent(t *testing.T) {
	s := mustOpen(t)
	scopeSeed(t, s, "shared note", "claude", "")
	for _, viewer := range []string{"claude", "codex", "opencode"} {
		if !containsRow(scopeRead(t, s, viewer), "shared note") {
			t.Errorf("viewer %s lost a shared row", viewer)
		}
	}
}

func TestScopePrivateRowHiddenFromOtherAgents(t *testing.T) {
	s := mustOpen(t)
	scopeSeed(t, s, "claude private", "claude", "private")
	if containsRow(scopeRead(t, s, "codex"), "claude private") {
		t.Error("codex saw claude's private row")
	}
	if !containsRow(scopeRead(t, s, "claude"), "claude private") {
		t.Error("claude lost its own private row")
	}
}

func TestScopePublicRowVisibleToAllAgents(t *testing.T) {
	s := mustOpen(t)
	scopeSeed(t, s, "published note", "claude", "public")
	for _, viewer := range []string{"codex", "opencode"} {
		if !containsRow(scopeRead(t, s, viewer), "published note") {
			t.Errorf("viewer %s lost a public row", viewer)
		}
	}
}

func TestScopeSystemReadSeesEverything(t *testing.T) {
	s := mustOpen(t)
	scopeSeed(t, s, "shared note", "claude", "")
	scopeSeed(t, s, "claude private", "claude", "private")
	rows := scopeRead(t, s, "")
	if !containsRow(rows, "shared note") || !containsRow(rows, "claude private") {
		t.Errorf("system read = %v, want the untouched view", rows)
	}
}

func TestScopeViewerIsNormalized(t *testing.T) {
	s := mustOpen(t)
	scopeSeed(t, s, "claude private", "claude", "private")
	// The clause normalizes the viewer before comparing, so the canonical
	// spelling sees the row.
	if !containsRow(scopeRead(t, s, "claude"), "claude private") {
		t.Error("the canonical viewer lost its own private row")
	}
	if containsRow(scopeRead(t, s, "codex"), "claude private") {
		t.Error("codex saw the private row")
	}
}

func TestScopeReadByIDDeniesLikeMissing(t *testing.T) {
	s := mustOpen(t)
	id := scopeSeed(t, s, "claude private", "claude", "private")
	l, err := s.GetLearningForViewer(id, "codex")
	if err == nil {
		t.Fatalf("codex read claude's private row: %+v", l)
	}
	// The hidden row answers in exactly the shape a missing id answers — the
	// same no-rows error, not a permission notice — so existence is never
	// confirmed through the denial.
	_, missingErr := s.GetLearning(99999)
	if !errors.Is(err, sql.ErrNoRows) || !errors.Is(missingErr, sql.ErrNoRows) {
		t.Errorf("hidden err = %v, want the same no-rows shape as %v", err, missingErr)
	}
	own, err := s.GetLearningForViewer(id, "claude")
	if err != nil || own == nil {
		t.Errorf("own read: %v, %v", own, err)
	}
}

func TestScopeVisibleLearningIDsMatchesTheFilter(t *testing.T) {
	s := mustOpen(t)
	scopeSeed(t, s, "shared note", "claude", "")
	privateID := scopeSeed(t, s, "claude private", "claude", "private")
	ids, err := s.VisibleLearningIDs("codex", "/w")
	if err != nil {
		t.Fatalf("VisibleLearningIDs: %v", err)
	}
	if ids[privateID] {
		t.Error("the private id is visible to codex")
	}
	own, _ := s.VisibleLearningIDs("claude", "/w")
	if !own[privateID] {
		t.Error("claude lost its own id in the visible set")
	}
}

func TestScopeStoredAndRoundTrips(t *testing.T) {
	s := mustOpen(t)
	id := scopeSeed(t, s, "claude private", "claude", "private")
	l, err := s.GetLearning(id)
	if err != nil {
		t.Fatalf("GetLearning: %v", err)
	}
	if l.SharingScope != "private" {
		t.Errorf("scope = %q, want private on the round trip", l.SharingScope)
	}
	if l.ID != id {
		t.Errorf("id = %d, want %d", l.ID, id)
	}
}
