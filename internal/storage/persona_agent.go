package storage

// Per-agent persona spaces beside the shared tables. The shared tables are
// upstream's and are not touched: with no agent override in play, resolution
// reads exactly the shared rows. An override row wins on the same
// (dimension, trait_key); shared keys the agent never touched pass through;
// agent-only keys surface on their own; the order is stable (dimension, then
// key), so the same state always resolves to the same persona.

import (
	"context"
	"sort"
	"strings"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/carsteneu/yesmem/internal/models"
)

const tablePersonaTraitsAgent = `CREATE TABLE IF NOT EXISTS persona_traits_agent (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	agent       TEXT NOT NULL,
	dimension   TEXT NOT NULL,
	trait_key   TEXT NOT NULL,
	trait_value TEXT NOT NULL,
	updated_at  TEXT NOT NULL,
	UNIQUE(agent, dimension, trait_key)
)`

const tablePersonaDirectivesAgent = `CREATE TABLE IF NOT EXISTS persona_directives_agent (
	agent      TEXT PRIMARY KEY,
	directive  TEXT NOT NULL,
	updated_at TEXT NOT NULL
)`

// personaAudit writes the persona.agent_override line under the conn's open
// transaction (or alone when conn is nil).
func (s *Store) personaAudit(conn *sql.Conn, detail string) error {
	q := `INSERT INTO governance_events (kind, key, detail, created_at)
		  VALUES ('persona.agent_override', ?, ?, ?)`
	now := time.Now().UTC().Format(time.RFC3339)
	if conn != nil {
		_, err := conn.ExecContext(context.Background(), q, "persona", detail, now)
		return err
	}
	_, err := s.db.Exec(q, "persona", detail, now)
	return err
}

// SetAgentPersonaTrait writes the agent's override for one trait key.
func (s *Store) SetAgentPersonaTrait(agent, dimension, key, value string) error {
	if agent == "" || dimension == "" || key == "" || value == "" {
		return errors.New("persona override: agent, dimension, key and value are required")
	}
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
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO persona_traits_agent (agent, dimension, trait_key, trait_value, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(agent, dimension, trait_key) DO UPDATE SET trait_value = excluded.trait_value, updated_at = excluded.updated_at`,
		agent, dimension, key, value, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return err
	}
	if err := s.personaAudit(conn, fmt.Sprintf("trait %s/%s on %s set", dimension, key, agent)); err != nil {
		return err
	}
	committed = true
	_, err = conn.ExecContext(ctx, "COMMIT")
	return err
}

// ClearAgentPersonaTrait removes the agent's override; the shared row shows
// through again.
func (s *Store) ClearAgentPersonaTrait(agent, dimension, key string) error {
	if agent == "" || dimension == "" || key == "" {
		return errors.New("persona clear: agent, dimension and key are required")
	}
	res, err := s.db.Exec(
		`DELETE FROM persona_traits_agent WHERE agent = ? AND dimension = ? AND trait_key = ?`,
		agent, dimension, key)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return s.personaAudit(nil, fmt.Sprintf("trait %s/%s on %s cleared", dimension, key, agent))
	}
	return nil
}

// SetAgentPersonaDirective replaces the agent's directive wholesale.
func (s *Store) SetAgentPersonaDirective(agent, directive string) error {
	if agent == "" || directive == "" {
		return errors.New("persona directive override: agent and directive are required")
	}
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
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO persona_directives_agent (agent, directive, updated_at)
		 VALUES (?, ?, ?)
		 ON CONFLICT(agent) DO UPDATE SET directive = excluded.directive, updated_at = excluded.updated_at`,
		agent, directive, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return err
	}
	if err := s.personaAudit(conn, fmt.Sprintf("directive on %s set", agent)); err != nil {
		return err
	}
	committed = true
	_, err = conn.ExecContext(ctx, "COMMIT")
	return err
}

// ClearAgentPersonaDirective removes the agent's directive override.
func (s *Store) ClearAgentPersonaDirective(agent string) error {
	res, err := s.db.Exec(`DELETE FROM persona_directives_agent WHERE agent = ?`, agent)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return s.personaAudit(nil, fmt.Sprintf("directive on %s cleared", agent))
	}
	return nil
}

// GetResolvedPersonaTraits resolves the persona for one agent: shared active
// traits, with the agent's overrides winning on the same (dimension, key) and
// the agent-only keys surfacing. An empty agent is the shared view.
func (s *Store) GetResolvedPersonaTraits(agent string, minConfidence float64) ([]models.PersonaTrait, error) {
	shared, err := s.GetActivePersonaTraits("default", minConfidence)
	if err != nil {
		return nil, err
	}
	out := make([]models.PersonaTrait, 0, len(shared))
	if agent == "" {
		return shared, nil
	}
	overrides, err := s.db.Query(
		`SELECT dimension, trait_key, trait_value FROM persona_traits_agent WHERE agent = ?`, agent)
	if err != nil {
		return nil, err
	}
	defer overrides.Close()
	ov := map[string]string{}
	for overrides.Next() {
		var d, k, v string
		if err := overrides.Scan(&d, &k, &v); err != nil {
			return nil, err
		}
		ov[d+"\x00"+k] = v
	}
	if err := overrides.Err(); err != nil {
		return nil, err
	}
	for _, t := range shared {
		if v, ok := ov[t.Dimension+"\x00"+t.TraitKey]; ok {
			c := t
			c.TraitValue = v
			c.Source = "agent_override"
			out = append(out, c)
			continue
		}
		out = append(out, t)
	}
	// Agent-only keys surface after the shared ones (map order is not stable
	// across calls, so the split keys are re-sorted below with the shared rows
	// already in their stable order — the override row itself never lands
	// twice: it replaced its shared twin above).
	type ovKey struct{ d, k string }
	var agentOnly []ovKey
	for combined := range ov {
		parts := strings.SplitN(combined, "\x00", 2)
		if len(parts) != 2 {
			continue
		}
		if _, taken := mapLookup(out, parts[0], parts[1]); taken {
			continue
		}
		agentOnly = append(agentOnly, ovKey{parts[0], parts[1]})
	}
	for _, key := range agentOnly {
		out = append(out, models.PersonaTrait{
			UserID: agent, Dimension: key.d, TraitKey: key.k, TraitValue: ov[key.d+"\x00"+key.k],
			Source: "agent_override",
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Dimension != out[j].Dimension {
			return out[i].Dimension < out[j].Dimension
		}
		return out[i].TraitKey < out[j].TraitKey
	})
	return out, nil
}

func mapLookup(traits []models.PersonaTrait, d, k string) (*models.PersonaTrait, bool) {
	for i := range traits {
		if traits[i].Dimension == d && traits[i].TraitKey == k {
			return &traits[i], true
		}
	}
	return nil, false
}

// GetResolvedPersonaDirective resolves the directive for one agent: the
// agent's override when it stands, the shared directive otherwise.
func (s *Store) GetResolvedPersonaDirective(agent string) (*models.PersonaDirective, error) {
	if agent != "" {
		row := s.db.QueryRow(
			`SELECT directive, updated_at FROM persona_directives_agent WHERE agent = ?`, agent)
		var d, updated string
		if err := row.Scan(&d, &updated); err == nil {
			return &models.PersonaDirective{UserID: agent, Directive: d}, nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	return s.GetPersonaDirective("default")
}
