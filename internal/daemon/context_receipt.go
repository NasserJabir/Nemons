package daemon

// The pack receipt (remediation 02 WS-C): build_context_pack issues every
// assembled manifest under a server-signed receipt, and check_pack_loss
// verifies the receipt before trusting a presented manifest. An ordinary
// content hash protects against accidental damage; the receipt is what makes
// the manifest authentic — proof that Nemons issued exactly this manifest for
// exactly this viewer, project and task, and that it has not expired.
//
// Design (the threat model's "simplest design that satisfies it"):
//   - HMAC-SHA256 under the store's locally protected signing key (0600 beside
//     the database, key-id guarded against silent replacement). Coding agents
//     hold no such key.
//   - An issuance record per receipt (pack_receipts) — a signature proves the
//     key holder signed it; the record proves THIS server issued it, and
//     carries the expiry as a queryable fact.
//   - The receipt binds Viewer, Project and TaskHash to the manifest hash.
//     Verification within the expiry is accepted (the check is read-only and
//     side-effect free — replay adds nothing); any other viewer, project,
//     task, or manifest is refused.
// Explicitly not claimed: protection against a compromised Nemons process or
// host (the key lives where the database lives).

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/NasserJabir/Nemons/internal/storage"
	"github.com/NasserJabir/Nemons/internal/textutil"
)

// packReceiptVersion gates the receipt shape: a verifier that cannot read
// this version refuses instead of guessing.
const packReceiptVersion = "1"

// packReceiptTTL is how long an issued receipt verifies. Star counts move
// slowly and so do tasks; one day is generous and bounded.
const packReceiptTTL = 24 * time.Hour

// packReceipt is the server-issued authenticity artifact for one manifest.
type packReceipt struct {
	SchemaVersion string    `json:"schema_version"`
	ReceiptID     string    `json:"receipt_id"`
	Viewer        string    `json:"viewer"`
	Project       string    `json:"project"`
	TaskHash      string    `json:"task_hash"`
	ManifestHash  string    `json:"manifest_hash"`
	IssuedAt      time.Time `json:"issued_at"`
	ExpiresAt     time.Time `json:"expires_at"`
	Nonce         string    `json:"nonce"`
	Signature     string    `json:"signature"`
}

// receiptSignature covers every field except the signature itself, marshalled
// canonically by the struct's fixed field order. The manifest hash inside it
// is the canonical content hash of the manifest (the same value
// manifestFingerprint computes), so a signature pins the manifest bytes.
func receiptSignature(r *packReceipt, key []byte) string {
	cp := *r
	cp.Signature = ""
	raw, err := json.Marshal(cp)
	if err != nil {
		return ""
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(raw)
	return hex.EncodeToString(mac.Sum(nil))
}

// issuePackReceipt signs the assembled manifest and records the issuance. The
// caller owns error handling: a key problem is an explicit failure, never a
// degraded pack.
func (h *Handler) issuePackReceipt(viewer, task, project string, manifest *packManifest) (*packReceipt, error) {
	return h.issuePackReceiptWithTTL(viewer, task, project, manifest, packReceiptTTL)
}

func (h *Handler) issuePackReceiptWithTTL(viewer, task, project string, manifest *packManifest, ttl time.Duration) (*packReceipt, error) {
	key, err := h.store.PackSigningKey()
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	now := time.Now()
	r := &packReceipt{
		SchemaVersion: packReceiptVersion,
		ReceiptID:     hex.EncodeToString(nonce),
		Viewer:        viewer,
		Project:       project,
		TaskHash:      textutil.ContentHash(task),
		ManifestHash:  manifestFingerprint(manifest),
		IssuedAt:      now,
		ExpiresAt:     now.Add(ttl),
		Nonce:         hex.EncodeToString(nonce),
	}
	r.Signature = receiptSignature(r, key)
	if err := h.store.RecordPackReceipt(storage.PackReceiptRecord{
		ReceiptID:    r.ReceiptID,
		Viewer:       r.Viewer,
		Project:      r.Project,
		TaskHash:     r.TaskHash,
		ManifestHash: r.ManifestHash,
		IssuedAt:     r.IssuedAt,
		ExpiresAt:    r.ExpiresAt,
		Nonce:        r.Nonce,
	}); err != nil {
		return nil, fmt.Errorf("receipt record: %w", err)
	}
	return r, nil
}

// verifyPackReceipt checks a presented receipt against the presented manifest
// and the requesting context. Every refusal names its reason without
// disclosing knowledge content. A nil error means the receipt is authentic,
// current, bound to this viewer/project/task, and covers exactly this
// manifest.
func (h *Handler) verifyPackReceipt(r *packReceipt, manifest *packManifest, viewer, project, taskHash string) error {
	if r == nil {
		return fmt.Errorf("the manifest was presented without its issuance receipt — authenticity cannot be established from a content hash alone")
	}
	if r.SchemaVersion != packReceiptVersion {
		return fmt.Errorf("receipt schema %q is not supported — refusing to verify against an unknown contract", r.SchemaVersion)
	}
	// The issuance record: a receipt this server never minted is refused even
	// if its signature were somehow well-formed.
	record, err := h.store.PackReceiptRecordByID(r.ReceiptID)
	if err != nil {
		return fmt.Errorf("receipt lookup: %w", err)
	}
	if record == nil {
		return fmt.Errorf("unknown receipt %s — no issuance record exists for it", r.ReceiptID)
	}
	// The record and the presented receipt must agree — a receipt whose
	// recorded fields were rewritten is a tampered receipt.
	if record.Viewer != r.Viewer || record.Project != r.Project ||
		record.TaskHash != r.TaskHash || record.ManifestHash != r.ManifestHash ||
		record.Nonce != r.Nonce {
		return fmt.Errorf("receipt %s does not match its issuance record — it was altered after issuance", r.ReceiptID)
	}
	// The signature, under the server key.
	key, err := h.store.PackSigningKey()
	if err != nil {
		return fmt.Errorf("receipt verification: %w", err)
	}
	if receiptSignature(r, key) != r.Signature {
		return fmt.Errorf("receipt %s: invalid signature", r.ReceiptID)
	}
	// Binding: the receipt belongs to this viewer, project and task.
	if r.Viewer != viewer {
		return fmt.Errorf("receipt %s was issued to viewer %q, not %q", r.ReceiptID, r.Viewer, viewer)
	}
	if r.Project != project {
		return fmt.Errorf("receipt %s was issued for project %q, not %q", r.ReceiptID, r.Project, project)
	}
	if r.TaskHash != taskHash {
		return fmt.Errorf("receipt %s was issued for a different task", r.ReceiptID)
	}
	// Currency: an expired receipt verifies nothing.
	if time.Now().After(r.ExpiresAt) {
		return fmt.Errorf("receipt %s expired at %s — rebuild the pack to get a fresh one", r.ReceiptID, r.ExpiresAt.UTC().Format(time.RFC3339))
	}
	// Coverage: the receipt must be for exactly the presented manifest.
	if r.ManifestHash != manifestFingerprint(manifest) {
		return fmt.Errorf("receipt %s covers a different manifest than the one presented", r.ReceiptID)
	}
	return nil
}
