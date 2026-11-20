package storage

// The operator authorization material (remediation WS-F): the governance
// decision authority needs an explicit, authenticated identity that no model
// ever holds. The token is generated once at first store open (secure first-run
// bootstrap), persisted in the governance config table (idempotent), and
// compared in constant time. The database file and its directory carry the OS
// permission boundary — the same one every other local credential in this
// deployment relies on.

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
)

const operatorTokenKey = "governance_operator_token"

// ensureOperatorToken generates the operator token once, on first open, and
// never rewrites an existing one: initialization is idempotent and an existing
// deployment keeps its authorization material.
func (s *Store) ensureOperatorToken() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS governance_config (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`); err != nil {
		return err
	}
	var existing string
	err := s.db.QueryRow(`SELECT value FROM governance_config WHERE key = ?`, operatorTokenKey).Scan(&existing)
	if err == nil && existing != "" {
		s.operatorToken = existing
		return nil
	}
	if err != nil && err.Error() != "sql: no rows in result set" {
		return err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := hex.EncodeToString(raw)
	if _, err := s.db.Exec(`INSERT INTO governance_config (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO NOTHING`, operatorTokenKey, token); err != nil {
		return err
	}
	s.operatorToken = token
	return nil
}

// OperatorToken returns the store's operator token. It exists for the operator
// tooling and the tests; agent-facing responses never include it.
func (s *Store) OperatorToken() string {
	return s.operatorToken
}

// OperatorTokenOK judges a presented token in constant time: the comparison
// takes the same path for every wrong candidate, so guessing is not timing-
// assisted.
func (s *Store) OperatorTokenOK(provided string) bool {
	if provided == "" || s.operatorToken == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(s.operatorToken)) == 1
}
