package storage

// Agent↔project bindings. A bound agent works inside its project: every
// memory path that claims a project is checked against the binding BEFORE any
// row is touched, and a claim that names another project — by name, by
// canonical form, or by a path outside the root — is refused with the binding
// named. Unbound callers keep the base behaviour; a binding lookup that fails
// closes the call instead of passing it.

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"time"
)

const tableAgentBindings = `CREATE TABLE IF NOT EXISTS agent_bindings (
	agent             TEXT PRIMARY KEY,
	project           TEXT NOT NULL,
	canonical_project TEXT NOT NULL DEFAULT '',
	updated_at        TEXT NOT NULL
)`

// AgentBinding is one bound agent's row.
type AgentBinding struct {
	Agent            string
	Project          string
	CanonicalProject string
	UpdatedAt        string
}

// BindAgent upserts the binding row for agent and writes its binding.upsert
// audit event in the same transaction. Rebinding to another project is a
// deliberate operator action: it lands, and the trail says so.
func (s *Store) BindAgent(agent, project string) error {
	if agent == "" {
		return errors.New("agent binding: agent must not be empty")
	}
	if project == "" {
		return errors.New("agent binding: project must not be empty")
	}
	canonical := s.resolveCanonicalProject(project)
	ctx := context.Background()
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(ctx, "ROLLBACK")
		}
	}()
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO agent_bindings (agent, project, canonical_project, updated_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(agent) DO UPDATE SET project = excluded.project,
		   canonical_project = excluded.canonical_project, updated_at = excluded.updated_at`,
		agent, project, canonical, now); err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO governance_events (kind, key, detail, created_at)
		 VALUES ('binding.upsert', ?, ?, ?)`,
		agent, "bound to "+project, now); err != nil {
		return err
	}
	committed = true
	_, err = conn.ExecContext(ctx, "COMMIT")
	return err
}

// AgentBindingFor reads the binding row, nil when the agent is unbound.
func (s *Store) AgentBindingFor(agent string) (*AgentBinding, error) {
	if agent == "" {
		return nil, nil
	}
	row := s.db.QueryRow(
		`SELECT agent, project, COALESCE(canonical_project, ''), updated_at
		 FROM agent_bindings WHERE agent = ?`, agent)
	var b AgentBinding
	if err := row.Scan(&b.Agent, &b.Project, &b.CanonicalProject, &b.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &b, nil
}

// CheckProjectClaim judges an agent's project claim against its binding.
// nil means the claim may proceed (unbound agents always pass); an error
// refuses it, naming the binding. A lookup failure closes the call: the
// caller sees the refusal, not a silent pass.
func (s *Store) CheckProjectClaim(agent, claimed string) error {
	if agent == "" || claimed == "" {
		return nil
	}
	b, err := s.AgentBindingFor(agent)
	if err != nil {
		return fmt.Errorf("binding lookup failed for %s: %w", agent, err)
	}
	if b == nil {
		return nil
	}
	if claimed == b.Project {
		return nil
	}
	// A path at or below the bound project is the same work.
	if filepath.IsAbs(b.Project) && filepath.IsAbs(claimed) {
		if rel, err := filepath.Rel(b.Project, filepath.Clean(claimed)); err == nil && rel != ".." && rel != "." && !filepath.IsAbs(rel) && rel[:2] != ".." {
			return nil
		}
	}
	// The canonical form of the claim decides the rest: worktree checkouts
	// resolve to their parent repository, and that is the same project.
	if claimedCanonical := s.resolveCanonicalProject(claimed); claimedCanonical != "" && claimedCanonical == b.CanonicalProject {
		return nil
	}
	return fmt.Errorf("agent %s is bound to project %s; refusing the claim for %s", agent, b.Project, claimed)
}
