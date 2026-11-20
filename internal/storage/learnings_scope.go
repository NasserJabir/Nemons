package storage

// The sharing-scope visibility helpers: the same rule the central read applies
// at its WHERE level, exposed for the agent-facing paths that do not go
// through LearningsFilter. A hidden row reads exactly like a missing one —
// existence is never leaked through the memory surface.

import (
	"database/sql"
	"fmt"
	"path/filepath"

	"github.com/NasserJabir/Nemons/internal/models"
)

// GetLearningForViewer reads one learning as the viewer's agent would see it.
// A row the viewer must not see (another agent's private row) returns the same
// error a missing id does: the caller cannot tell a hidden row from an absent
// one. An empty viewer is a system read and sees everything.
func (s *Store) GetLearningForViewer(id int64, viewer string) (*models.Learning, error) {
	l, err := s.GetLearning(id)
	if err != nil {
		return nil, err
	}
	viewer = models.NormalizeSourceAgent(viewer)
	if viewer == "" {
		return l, nil
	}
	switch l.SharingScope {
	case "", "project", "public":
		return l, nil
	case "private":
		if models.NormalizeSourceAgent(l.SourceAgent) == viewer {
			return l, nil
		}
		// Hidden: the literal not-found, not a permission notice — the row's
		// existence stays unconfirmed through the memory surface.
		return nil, fmt.Errorf("get learning %d: %w", id, sql.ErrNoRows)
	default:
		// An unknown scope value cannot be written through the store's policy;
		// if one is ever on disk, treat it as shared-nothing and hide it.
		return nil, fmt.Errorf("get learning %d: %w", id, sql.ErrNoRows)
	}
}

// ActiveLearningsForProjectViewer is ActiveLearningsForProject served to one
// agent: the same project resolution (short names, marker roots, repository
// roots and the subtree read below a repository root), with the sharing-scope
// clause applied. The system read (empty viewer) is byte-identical to
// ActiveLearningsForProject.
func (s *Store) ActiveLearningsForProjectViewer(project, category, viewer string, limit int) ([]models.Learning, error) {
	if models.NormalizeSourceAgent(viewer) == "" {
		return s.ActiveLearningsForProject(project, category, limit)
	}
	if !filepath.IsAbs(project) {
		return s.GetActiveLearningsFiltered(LearningsFilter{Category: category, Project: project, Viewer: viewer}, limit)
	}
	clean := filepath.Clean(project)
	if markerRoot := projectReadRoot(clean); markerRoot != "" && markerRoot != clean {
		return s.GetActiveLearningsFiltered(LearningsFilter{Category: category, Project: project, Viewer: viewer}, limit)
	}
	if !isRepositoryRoot(clean) {
		return s.GetActiveLearningsFiltered(LearningsFilter{Category: category, Project: project, Viewer: viewer}, limit)
	}
	return s.GetActiveLearningsFiltered(LearningsFilter{Category: category, ProjectSubtree: clean, Viewer: viewer}, limit)
}

// VisibleLearningIDs returns the set of active learning ids the viewer's agent
// may see in project — the same rows GetActiveLearningsFiltered with the same
// Viewer would return, keyed by id for the paths that filter an existing list.
func (s *Store) VisibleLearningIDs(viewer, project string) (map[int64]bool, error) {
	rows, err := s.GetActiveLearningsFiltered(LearningsFilter{Project: project, Viewer: viewer}, 0)
	if err != nil {
		return nil, err
	}
	out := make(map[int64]bool, len(rows))
	for _, l := range rows {
		out[l.ID] = true
	}
	return out, nil
}
