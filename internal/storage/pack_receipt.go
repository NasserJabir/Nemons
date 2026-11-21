package storage

// The Context Pack signing key and the receipt issuance record (remediation 02
// WS-C). The pack receipt is a server-signed artifact: build_context_pack
// HMACs the issued manifest under this key, and check_pack_loss verifies the
// signature before trusting any presented manifest. The key never leaves this
// process through an API response.

// Key lifecycle: the 32-byte key is generated once, persisted as hex next to
// the database file with 0600 (the same OS boundary every other local
// credential in this deployment relies on), and initialized safely under
// concurrent startup (O_EXCL — the loser of the create race reads the file
// the winner wrote, so both processes converge on one key). A corrupted key
// file refuses fail-closed: no silent regeneration, because a regenerated key
// would silently invalidate every outstanding receipt. Loss or replacement of
// the key file is detected against a key-id recorded in the store at
// adoption time; only the explicit rotation command updates that record.
// In-memory stores carry an ephemeral key with no persistence and no guard —
// their receipts live exactly as long as the store instance.

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	packKeyFile      = "pack_receipt.key"
	packKeyIDKey     = "pack_receipt_key_id"
	packReceiptTable = `CREATE TABLE IF NOT EXISTS pack_receipts (
		receipt_id    TEXT PRIMARY KEY,
		viewer        TEXT NOT NULL,
		project       TEXT NOT NULL,
		task_hash     TEXT NOT NULL,
		manifest_hash TEXT NOT NULL,
		issued_at     TEXT NOT NULL,
		expires_at    TEXT NOT NULL,
		nonce         TEXT NOT NULL
	)`
)

var packKeyMu sync.Mutex

// packKeyPath is where the signing key lives: beside the database, so it
// inherits the data directory's OS permissions.
func (s *Store) packKeyPath() string {
	if s.dbPath == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(s.dbPath), packKeyFile)
}

// loadOrCreatePackKey returns the signing key, creating it on first use.
func loadOrCreatePackKey(path string) ([]byte, error) {
	if raw, err := os.ReadFile(path); err == nil {
		key, perr := parsePackKey(string(raw))
		if perr != nil {
			return nil, fmt.Errorf("pack signing key at %s is corrupted: %w — restore the file or rotate explicitly; no silent regeneration", path, perr)
		}
		return key, nil
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("pack signing key at %s is unreadable: %w", path, err)
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if os.IsExist(err) {
			// Another process won the create race: converge on its key.
			raw, rerr := os.ReadFile(path)
			if rerr != nil {
				return nil, fmt.Errorf("pack signing key at %s appeared but is unreadable: %w", path, rerr)
			}
			return parsePackKey(string(raw))
		}
		return nil, fmt.Errorf("pack signing key create at %s: %w", path, err)
	}
	defer f.Close()
	if _, err := f.Write([]byte(hex.EncodeToString(key))); err != nil {
		return nil, err
	}
	return key, nil
}

func parsePackKey(raw string) ([]byte, error) {
	key, err := hex.DecodeString(strings.TrimSpace(raw))
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("expected 32 key bytes, got %d", len(key))
	}
	return key, nil
}

// packKeyID derives the adoption fingerprint of a key: a short HMAC of a
// fixed label, stored in the governance config at adoption time.
func packKeyID(key []byte) string {
	sum := sha256.Sum256(append([]byte("nemons pack receipt key id"), key...))
	return hex.EncodeToString(sum[:8])
}

// PackSigningKey returns the store's pack receipt signing key, adopting it on
// first use and refusing when the file no longer matches the recorded key id
// (the file was corrupted, replaced, or lost — an explicit operator decision
// is required, never a silent reissue).
func (s *Store) PackSigningKey() ([]byte, error) {
	packKeyMu.Lock()
	defer packKeyMu.Unlock()

	if _, err := s.db.Exec(packReceiptTable); err != nil {
		return nil, fmt.Errorf("pack receipts table: %w", err)
	}
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS governance_config (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`); err != nil {
		return nil, fmt.Errorf("governance config table: %w", err)
	}
	path := s.packKeyPath()
	if path == "" {
		// Ephemeral store: one key per store instance, no persistence.
		if s.ephemeralPackKey == nil {
			key := make([]byte, 32)
			if _, err := rand.Read(key); err != nil {
				return nil, err
			}
			s.ephemeralPackKey = key
		}
		return s.ephemeralPackKey, nil
	}
	key, err := loadOrCreatePackKey(path)
	if err != nil {
		return nil, err
	}
	// The adoption guard: the recorded key id must match the key on disk.
	var recorded string
	err = s.db.QueryRow(`SELECT value FROM governance_config WHERE key = ?`, packKeyIDKey).Scan(&recorded)
	switch {
	case err == nil:
		if subtle.ConstantTimeCompare([]byte(recorded), []byte(packKeyID(key))) != 1 {
			return nil, fmt.Errorf("pack signing key state mismatch: the key file at %s no longer matches the recorded key id — restore the file or rotate the key explicitly; receipts already issued verify only under the recorded key", path)
		}
	case err.Error() == "sql: no rows in result set":
		// First adoption: record the key id under the same lock-free idempotent
		// write the operator token uses.
		if _, uerr := s.db.Exec(`INSERT INTO governance_config (key, value) VALUES (?, ?)
			ON CONFLICT(key) DO NOTHING`, packKeyIDKey, packKeyID(key)); uerr != nil {
			return nil, uerr
		}
	default:
		return nil, err
	}
	return key, nil
}

// RotatePackSigningKey replaces the signing key explicitly: the old key file
// is overwritten atomically and the recorded key id moves with it. Every
// receipt issued under the old key becomes unverifiable — that is the
// documented rotation contract, not an accident.
func (s *Store) RotatePackSigningKey() error {
	packKeyMu.Lock()
	defer packKeyMu.Unlock()

	path := s.packKeyPath()
	if path == "" {
		s.ephemeralPackKey = nil // next PackSigningKey mints a fresh one
		return nil
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return err
	}
	tmp := path + ".rotating"
	if err := os.WriteFile(tmp, []byte(hex.EncodeToString(key)), 0o600); err != nil {
		return fmt.Errorf("pack key rotation write: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("pack key rotation rename: %w", err)
	}
	if _, err := s.db.Exec(`INSERT INTO governance_config (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		packKeyIDKey, packKeyID(key)); err != nil {
		return err
	}
	return nil
}

// PackReceiptRecord is one issued receipt as the server remembers it.
type PackReceiptRecord struct {
	ReceiptID    string
	Viewer       string
	Project      string
	TaskHash     string
	ManifestHash string
	IssuedAt     time.Time
	ExpiresAt    time.Time
	Nonce        string
}

// RecordPackReceipt persists an issuance record so verification can tell a
// receipt this server minted from a well-forged one presented with a stolen
// key id, and so expiry is a queryable fact.
func (s *Store) RecordPackReceipt(r PackReceiptRecord) error {
	if _, err := s.db.Exec(packReceiptTable); err != nil {
		return err
	}
	_, err := s.db.Exec(`INSERT INTO pack_receipts
		(receipt_id, viewer, project, task_hash, manifest_hash, issued_at, expires_at, nonce)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(receipt_id) DO NOTHING`,
		r.ReceiptID, r.Viewer, r.Project, r.TaskHash, r.ManifestHash,
		r.IssuedAt.UTC().Format(time.RFC3339), r.ExpiresAt.UTC().Format(time.RFC3339), r.Nonce)
	return err
}

// PackReceiptRecordByID returns one issuance record. A missing record is the
// unknown-receipt refusal.
func (s *Store) PackReceiptRecordByID(id string) (*PackReceiptRecord, error) {
	var r PackReceiptRecord
	var issued, expires string
	err := s.db.QueryRow(`SELECT receipt_id, viewer, project, task_hash, manifest_hash,
		issued_at, expires_at, nonce FROM pack_receipts WHERE receipt_id = ?`, id).
		Scan(&r.ReceiptID, &r.Viewer, &r.Project, &r.TaskHash, &r.ManifestHash,
			&issued, &expires, &r.Nonce)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if r.IssuedAt, err = time.Parse(time.RFC3339, issued); err != nil {
		return nil, fmt.Errorf("receipt %s: issued_at: %w", id, err)
	}
	if r.ExpiresAt, err = time.Parse(time.RFC3339, expires); err != nil {
		return nil, fmt.Errorf("receipt %s: expires_at: %w", id, err)
	}
	return &r, nil
}
