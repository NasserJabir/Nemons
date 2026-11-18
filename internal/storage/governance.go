package storage

// Governance approvals and their audit trail. Nemons governs a small set of
// memory-touching operations through an explicit approval lifecycle: a caller
// whose request needs approval opens an ask (keyed by the request packet's
// digest), the operator decides it, and every transition writes its own event
// in the same transaction as the row it describes. The write+event pair shares
// one BEGIN IMMEDIATE transaction (the DeleteDocSource idiom) so a concurrent
// appender cannot interleave between the row and its event.

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

const (
	tableGovernanceApprovals = `CREATE TABLE IF NOT EXISTS governance_approvals (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	key         TEXT NOT NULL UNIQUE,
	method      TEXT NOT NULL,
	caller      TEXT NOT NULL DEFAULT '',
	surface     TEXT NOT NULL DEFAULT 'agent',
	status      TEXT NOT NULL DEFAULT 'open',
	decision    TEXT NOT NULL DEFAULT '',
	requested_at TEXT NOT NULL,
	decided_at  TEXT,
	expires_at  TEXT
)`

	tableGovernanceEvents = `CREATE TABLE IF NOT EXISTS governance_events (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	kind        TEXT NOT NULL,
	approval_id INTEGER,
	key         TEXT NOT NULL DEFAULT '',
	detail      TEXT NOT NULL DEFAULT '',
	created_at  TEXT NOT NULL
)`
)

// Approval statuses and decisions.
const (
	ApprovalOpen    = "open"
	ApprovalDecided = "decided"
	ApprovalExpired = "expired"

	ApprovalAllow = "allow"
	ApprovalDeny  = "deny"

	EventApprovalRequested = "approval.requested"
	EventApprovalDecided   = "approval.decided"
	EventApprovalExpired   = "approval.expired"
)

// GovernanceApproval is one ask row: what was requested, by whom, and where it
// stands.
type GovernanceApproval struct {
	ID         int64
	Key        string
	Method     string
	Caller     string
	Surface    string
	Status     string
	Decision   string
	RequestedAt string
	DecidedAt  string
	ExpiresAt  string
}

// GovernanceEvent is one audit line in the governance trail.
type GovernanceEvent struct {
	ID        int64
	Kind      string
	ApprovalID int64
	Key       string
	Detail    string
	CreatedAt string
}

// ErrApprovalNotOpen reports a decide on a row that is no longer open: the
// decision landed after a concurrent terminal transition (a decide or an
// expiry) already closed it, so it is refused instead of being applied twice.
var ErrApprovalNotOpen = errors.New("governance approval is not open")

// ErrApprovalUnknown reports a decide or read for a key the store never saw.
var ErrApprovalUnknown = errors.New("governance approval key is unknown")

// nowUTC renders the store's timestamps. UTC keeps the julianday() windows the
// rest of the store relies on consistent with these rows.
func nowUTC() string { return time.Now().UTC().Format(time.RFC3339) }

// RequestApproval opens (or finds) the approval ask for key. The ask is
// idempotent: an already-open row for the same key is returned as it is, with
// no second row and no second event, so a caller that retries its ask cannot
// stack open requests behind one another. The row and its approval.requested
// event share one BEGIN IMMEDIATE transaction.
func (s *Store) RequestApproval(key, method, caller, surface string, ttl time.Duration) (int64, error) {
	if key == "" {
		return 0, errors.New("governance approval key must not be empty")
	}
	if method == "" {
		return 0, errors.New("governance approval method must not be empty")
	}
	if surface == "" {
		surface = "agent"
	}
	ctx := context.Background()
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return 0, err
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(ctx, "ROLLBACK")
		}
	}()

	var id int64
	err = conn.QueryRowContext(ctx,
		`SELECT id FROM governance_approvals WHERE key = ? AND status = ?`, key, ApprovalOpen,
	).Scan(&id)
	if err == nil {
		committed = true
		if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
			return 0, err
		}
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}

	nowT := time.Now().UTC()
	now := nowT.Format(time.RFC3339)
	expires := nowT.Add(ttl).Format(time.RFC3339)
	res, err := conn.ExecContext(ctx,
		`INSERT INTO governance_approvals (key, method, caller, surface, status, requested_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		key, method, caller, surface, ApprovalOpen, now, expires)
	if err != nil {
		return 0, err
	}
	id, err = res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO governance_events (kind, approval_id, key, detail, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
		EventApprovalRequested, id, key, method+" on "+surface, now); err != nil {
		return 0, err
	}
	committed = true
	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return 0, err
	}
	return id, nil
}

// ApprovalForKey reads the row a key currently names, open or closed. The
// enforcement gate is a pure reader over these rows: it never opens or closes
// one, it only looks.
func (s *Store) ApprovalForKey(key string) (*GovernanceApproval, error) {
	row := s.db.QueryRow(
		`SELECT id, key, method, caller, surface, status, decision, requested_at, COALESCE(decided_at, ''), COALESCE(expires_at, '')
		 FROM governance_approvals WHERE key = ?`, key)
	var a GovernanceApproval
	if err := row.Scan(&a.ID, &a.Key, &a.Method, &a.Caller, &a.Surface, &a.Status, &a.Decision,
		&a.RequestedAt, &a.DecidedAt, &a.ExpiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

// OpenApprovalCount reports how many asks currently wait for a decision.
func (s *Store) OpenApprovalCount() (int, error) {
	var n int
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM governance_approvals WHERE status = ?`, ApprovalOpen,
	).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// DecideApproval closes the open row a key names with decision. The update
// lands by row id and status together: a decision that arrives after a
// concurrent terminal transition already closed the row is refused with
// ErrApprovalNotOpen instead of being applied a second time. The row's
// decision and its approval.decided event share one transaction.
func (s *Store) DecideApproval(key, decision, decider string) error {
	if decision != ApprovalAllow && decision != ApprovalDeny {
		return errors.New("governance decision must be allow or deny")
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

	var id int64
	var status string
	err = conn.QueryRowContext(ctx,
		`SELECT id, status FROM governance_approvals WHERE key = ?`, key,
	).Scan(&id, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrApprovalUnknown
	}
	if err != nil {
		return err
	}
	if status != ApprovalOpen {
		return ErrApprovalNotOpen
	}
	now := nowUTC()
	res, err := conn.ExecContext(ctx,
		`UPDATE governance_approvals SET status = ?, decision = ?, decided_at = ? WHERE id = ? AND status = ?`,
		ApprovalDecided, decision, now, id, ApprovalOpen)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrApprovalNotOpen
	}
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO governance_events (kind, approval_id, key, detail, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
		EventApprovalDecided, id, key, decision+" by "+decider, now); err != nil {
		return err
	}
	committed = true
	_, err = conn.ExecContext(ctx, "COMMIT")
	return err
}

// GovernanceEvents reads the audit trail, newest last. A limit of 0 means
// unlimited.
func (s *Store) GovernanceEvents(limit int) ([]GovernanceEvent, error) {
	q := `SELECT id, kind, COALESCE(approval_id, 0), key, detail, created_at
		 FROM governance_events ORDER BY id`
	var args []any
	if limit > 0 {
		q += " LIMIT ?"
		args = append(args, limit)
	}
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GovernanceEvent
	for rows.Next() {
		var e GovernanceEvent
		if err := rows.Scan(&e.ID, &e.Kind, &e.ApprovalID, &e.Key, &e.Detail, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GovernanceSnapshot returns the full event sequence the store holds — the
// picture a snapshot read presents to the operator.
func (s *Store) GovernanceSnapshot() ([]GovernanceEvent, error) {
	return s.GovernanceEvents(0)
}

// ExpireStaleApprovals closes every open ask whose expiry has passed, in one
// BEGIN IMMEDIATE transaction: it selects the due rows, then terminates each
// BY ITS ID — a decision that lands between the read and the update has
// already written its own event, so the expiry skips that row instead of
// closing it twice. Every row the sweep closes writes an approval.expired
// event carrying the row's own id and key: the request's lifecycle is covered
// end to end, requested → decided or expired, with no silent ends.
func (s *Store) ExpireStaleApprovals(now time.Time) (int64, error) {
	ctx := context.Background()
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return 0, err
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(ctx, "ROLLBACK")
		}
	}()

	type dueRow struct {
		id  int64
		key string
	}
	rows, err := conn.QueryContext(ctx,
		`SELECT id, key FROM governance_approvals
		 WHERE status = ? AND expires_at IS NOT NULL AND expires_at <= ?`,
		ApprovalOpen, now.UTC().Format(time.RFC3339))
	if err != nil {
		return 0, err
	}
	var due []dueRow
	for rows.Next() {
		var r dueRow
		if err := rows.Scan(&r.id, &r.key); err != nil {
			rows.Close()
			return 0, err
		}
		due = append(due, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	var closed int64
	for _, r := range due {
		res, err := conn.ExecContext(ctx,
			`UPDATE governance_approvals SET status = ? WHERE id = ? AND status = ?`,
			ApprovalExpired, r.id, ApprovalOpen)
		if err != nil {
			return 0, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			// A concurrent decision closed it first and wrote its own event:
			// the expiry skips the row.
			continue
		}
		if _, err := conn.ExecContext(ctx,
			`INSERT INTO governance_events (kind, approval_id, key, detail, created_at)
			 VALUES (?, ?, ?, ?, ?)`,
			EventApprovalExpired, r.id, r.key, "expired unread", now.UTC().Format(time.RFC3339)); err != nil {
			return 0, err
		}
		closed += n
	}
	committed = true
	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return 0, err
	}
	return closed, nil
}
