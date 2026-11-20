package storage

// The knowledge-and-memory stage: transcript search over the project's
// sessions and the knowledge base's own counters.

import "fmt"

// TranscriptHit is one transcript line a search returned.
type TranscriptHit struct {
	SessionID string
	Role      string
	Timestamp string
	Content   string
}

// SearchTranscripts returns the transcript lines whose content carries every
// term, scoped to the project's sessions. LIKE terms run in SQL; the join
// keeps the read inside the project the memory belongs to.
func (s *Store) SearchTranscripts(project string, terms []string, limit int) ([]TranscriptHit, error) {
	if len(terms) == 0 {
		return nil, nil
	}
	if limit <= 0 {
		limit = 20
	}
	where := make([]string, 0, len(terms)+1)
	args := make([]any, 0, len(terms)+1)
	for _, term := range terms {
		where = append(where, "m.content LIKE ?")
		args = append(args, "%"+term+"%")
	}
	scope := ""
	if project != "" {
		scope = " AND s.project = ?"
		args = append(args, project)
	}
	q := fmt.Sprintf(`SELECT m.session_id, m.role, m.timestamp, COALESCE(m.content, '')
		FROM messages m JOIN sessions s ON m.session_id = s.id
		WHERE (%s)%s ORDER BY m.timestamp DESC LIMIT ?`, joinStrings(where, " AND "), scope)
	args = append(args, limit)
	rows, err := s.readerDB().Query(q, args...)
	if err != nil {
		return nil, fmt.Errorf("search transcripts: %w", err)
	}
	defer rows.Close()
	var out []TranscriptHit
	for rows.Next() {
		var h TranscriptHit
		if err := rows.Scan(&h.SessionID, &h.Role, &h.Timestamp, &h.Content); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// KnowledgeCounts fills the operator's picture: live vs superseded, per
// category, per sharing scope, and the busiest projects.
func (s *Store) KnowledgeCounts() (map[string]any, error) {
	out := map[string]any{}
	var live, superseded int
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM learnings WHERE superseded_by IS NULL`).Scan(&live); err != nil {
		return nil, err
	}
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM learnings WHERE superseded_by IS NOT NULL`).Scan(&superseded); err != nil {
		return nil, err
	}
	out["live"] = live
	out["superseded"] = superseded

	byCategory := map[string]int{}
	rows, err := s.db.Query(
		`SELECT category, COUNT(*) FROM learnings WHERE superseded_by IS NULL GROUP BY category ORDER BY COUNT(*) DESC`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var cat string
		var n int
		if err := rows.Scan(&cat, &n); err != nil {
			rows.Close()
			return nil, err
		}
		byCategory[cat] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out["by_category"] = byCategory

	byScope := map[string]int{}
	rows, err = s.db.Query(
		`SELECT COALESCE(scope, '') AS sc, COUNT(*) FROM learnings WHERE superseded_by IS NULL GROUP BY sc`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var sc string
		var n int
		if err := rows.Scan(&sc, &n); err != nil {
			rows.Close()
			return nil, err
		}
		if sc == "" {
			sc = "shared"
		}
		byScope[sc] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out["by_scope"] = byScope

	byProject := map[string]int{}
	rows, err = s.db.Query(
		`SELECT COALESCE(NULLIF(project, ''), '(global)'), COUNT(*)
		 FROM learnings WHERE superseded_by IS NULL
		 GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 5`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var p string
		var n int
		if err := rows.Scan(&p, &n); err != nil {
			rows.Close()
			return nil, err
		}
		byProject[p] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out["top_projects"] = byProject
	return out, nil
}
