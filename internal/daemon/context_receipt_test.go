package daemon

// The pack receipt regression suite (remediation 02 WS-C5): authenticity of
// the issued manifest — valid receipts verify, and every forgery shape the
// threat model names is refused. An ordinary hash is never accepted as a
// substitute for authenticity (C-03).

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/storage"
)

// receiptBuild issues a pack through the real build path and returns the
// delivered items, manifest and receipt.
func receiptBuild(t *testing.T, h *Handler, viewer, task string) (delivered []any, manifest map[string]any, receipt map[string]any) {
	t.Helper()
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate"})
	built := buildPack(t, h, viewer, task, nil)
	return deliveredFromItems(packItemsFrom(t, built)), packManifestOf(t, built), packReceiptOf(t, built)
}

func receiptCheck(t *testing.T, h *Handler, delivered []any, manifest, receipt map[string]any, extra map[string]any) Response {
	t.Helper()
	params := map[string]any{
		"task": "loss check", "project": "/w", "delivered": delivered,
		"manifest": manifest, "receipt": receipt,
		"_source_agent": "claude", "_source_agent_source": "resolved",
	}
	for k, v := range extra {
		params[k] = v
	}
	return h.Handle(Request{Method: "check_pack_loss", Params: params})
}

func TestReceiptValidDeliveryVerifiesLossless(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")
	resp := receiptCheck(t, h, delivered, manifest, receipt, nil)
	if resp.Error != "" {
		t.Fatalf("an authentic pack was refused: %v", resp.Error)
	}
	if !strings.Contains(string(resp.Result), "lossless") {
		t.Fatalf("an authentic pack did not verify lossless: %.200s", string(resp.Result))
	}
}

func TestReceiptWrongViewerRefused(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")
	resp := receiptCheck(t, h, delivered, manifest, receipt, map[string]any{
		"_source_agent": "mallory", "_source_agent_source": "resolved"})
	if resp.Error == "" || !strings.Contains(resp.Error, "was issued to viewer") {
		t.Fatalf("a receipt for another viewer was accepted: %v", resp.Error)
	}
}

func TestReceiptWrongProjectRefused(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")
	// Same receipt, different project: the binding holds even though the
	// manifest itself is untouched.
	resp := receiptCheck(t, h, delivered, manifest, receipt, map[string]any{"project": "/other"})
	if resp.Error == "" || !strings.Contains(resp.Error, "was issued for project") {
		t.Fatalf("a receipt for another project was accepted: %v", resp.Error)
	}
}

func TestReceiptWrongTaskRefused(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")
	resp := receiptCheck(t, h, delivered, manifest, receipt, map[string]any{"task": "a different task"})
	if resp.Error == "" || !strings.Contains(resp.Error, "different task") {
		t.Fatalf("a receipt for another task was accepted: %v", resp.Error)
	}
}

func TestReceiptExpiredRefused(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate"})
	built := buildPack(t, h, "claude", "loss check", nil)
	// Issue with a TTL in the past — the expired-receipt policy is refuse.
	expired, err := h.issuePackReceiptWithTTL("claude", "loss check", "/w", manifestFromMap(t, packManifestOf(t, built)), -time.Hour)
	if err != nil {
		t.Fatalf("issue expired receipt: %v", err)
	}
	delivered := deliveredFromItems(packItemsFrom(t, built))
	resp := receiptCheck(t, h, delivered, packManifestOf(t, built), mustJSON(t, expired), nil)
	if resp.Error == "" || !strings.Contains(resp.Error, "expired") {
		t.Fatalf("an expired receipt was accepted: %v", resp.Error)
	}
}

func TestReceiptInvalidSignatureRefused(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")
	sig := receipt["signature"].(string)
	flip := "0"
	if sig[0] == '0' {
		flip = "1"
	}
	receipt["signature"] = flip + sig[1:]
	resp := receiptCheck(t, h, delivered, manifest, receipt, nil)
	if resp.Error == "" || !strings.Contains(resp.Error, "invalid signature") {
		t.Fatalf("a tampered signature was accepted: %v", resp.Error)
	}
}

// C-03: the caller rewrites the manifest AND recomputes the ordinary
// fingerprint — internally consistent, still worthless without the receipt.
func TestReceiptRecomputedHashCannotBypassAuthenticity(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")
	// Rewrite a selected item's hash and patch the fingerprint so the manifest
	// is internally consistent again.
	items := manifest["knowledge"].([]any)
	first := items[0].(map[string]any)
	first["content_hash"] = "deadbeef00000000"
	manifest["fingerprint"] = recomputedFingerprint(t, manifest)
	resp := receiptCheck(t, h, delivered, manifest, receipt, nil)
	if resp.Error == "" || !strings.Contains(resp.Error, "covers a different manifest") {
		t.Fatalf("a recomputed fingerprint bypassed authenticity: %v", resp.Error)
	}
}

func TestReceiptUnknownReceiptRefused(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")
	// A receipt this server never minted: well-formed, signature and all,
	// but absent from the issuance record.
	if _, err := h.store.DB().Exec(`DELETE FROM pack_receipts WHERE receipt_id = ?`, receipt["receipt_id"]); err != nil {
		t.Fatal(err)
	}
	resp := receiptCheck(t, h, delivered, manifest, receipt, nil)
	if resp.Error == "" || !strings.Contains(resp.Error, "unknown receipt") {
		t.Fatalf("an unrecorded receipt was accepted: %v", resp.Error)
	}
}

func TestReceiptMissingManifestRefused(t *testing.T) {
	h, _ := mustHandler(t)
	delivered, manifest, _ := receiptBuild(t, h, "claude", "loss check")
	// The manifest is presented with NO receipt: authenticity cannot be
	// established from a content hash alone.
	params := map[string]any{
		"task": "loss check", "project": "/w", "delivered": delivered,
		"manifest": manifest,
		"_source_agent": "claude", "_source_agent_source": "resolved",
	}
	resp := h.Handle(Request{Method: "check_pack_loss", Params: params})
	if resp.Error == "" || !strings.Contains(resp.Error, "without its issuance receipt") {
		t.Fatalf("a bare manifest (no receipt) was accepted: %v", resp.Error)
	}
}

// The file-backed lifecycle: persistence across restart, corruption refusal,
// concurrent initialization, and explicit rotation.
func TestReceiptKeySurvivesRestartAndRefusesCorruption(t *testing.T) {
	h, s := mustFileHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")

	// Restart: reopen the store on the same files — the key persists, the
	// receipt still verifies.
	s.Close()
	s2, err := storage.Open(filepath.Join(h.dataDir, "nemons.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	h2 := NewHandler(s2, nil)
	h2.dataDir = h.dataDir
	h2.disableAgentProcesses = true
	resp := receiptCheck(t, h2, delivered, manifest, receipt, nil)
	if resp.Error != "" {
		t.Fatalf("a receipt did not survive the restart: %v", resp.Error)
	}

	// Corruption: garbage in the key file refuses fail-closed — no silent
	// regeneration that would strand every outstanding receipt.
	keyPath := filepath.Join(h.dataDir, "pack_receipt.key")
	if err := os.WriteFile(keyPath, []byte("not-a-key"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := h2.store.PackSigningKey(); err == nil || !strings.Contains(err.Error(), "corrupted") {
		t.Fatalf("a corrupted key file was not refused: %v", err)
	}

	// Loss: a deleted key file mismatches the recorded key id — the explicit
	// refusal, never a silent reissue.
	os.Remove(keyPath)
	if _, err := h2.store.PackSigningKey(); err == nil || !strings.Contains(err.Error(), "state mismatch") {
		t.Fatalf("a replaced key file was not refused: %v", err)
	}
}

func TestReceiptKeyConcurrentInitializationConverges(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "nemons.db")
	s1, err := storage.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer s1.Close()
	s2, err := storage.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()

	var (
		wg   sync.WaitGroup
		keys = make([][]byte, 4)
		errs = make([]error, 4)
	)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			st := s1
			if i%2 == 1 {
				st = s2
			}
			keys[i], errs[i] = st.PackSigningKey()
		}(i)
	}
	wg.Wait()
	for i := range errs {
		if errs[i] != nil {
			t.Fatalf("concurrent initialization failed: %v", errs[i])
		}
	}
	for i := 1; i < 4; i++ {
		if string(keys[i]) != string(keys[0]) {
			t.Fatal("concurrent initialization produced divergent keys")
		}
	}
}

func TestReceiptKeyRotationInvalidatesOldReceipts(t *testing.T) {
	h, s := mustFileHandler(t)
	delivered, manifest, receipt := receiptBuild(t, h, "claude", "loss check")

	// Rotation is explicit and audited; the old receipt becomes unverifiable
	// by contract, and fresh issuance works again.
	if err := s.RotatePackSigningKey(); err != nil {
		t.Fatalf("rotate: %v", err)
	}
	resp := receiptCheck(t, h, delivered, manifest, receipt, nil)
	if resp.Error == "" {
		t.Fatal("a receipt issued under the rotated-out key still verified")
	}
	fresh, err := h.issuePackReceipt("claude", "loss check", "/w", manifestFromMap(t, manifest))
	if err != nil {
		t.Fatalf("post-rotation issuance: %v", err)
	}
	resp = receiptCheck(t, h, delivered, manifest, mustJSON(t, fresh), nil)
	if resp.Error != "" {
		t.Fatalf("a fresh receipt after rotation was refused: %v", resp.Error)
	}
}

func TestReceiptNeverCarriesTheKey(t *testing.T) {
	h, _ := mustHandler(t)
	_, _, receipt := receiptBuild(t, h, "claude", "loss check")
	encoded, _ := json.Marshal(receipt)
	key, err := h.store.PackSigningKey()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), string(key)) {
		t.Fatal("the receipt leaked signing key material")
	}
}

// manifestFromMap round-trips the response manifest into the typed struct the
// issuance path signs.
func manifestFromMap(t *testing.T, m map[string]any) *packManifest {
	t.Helper()
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	var out packManifest
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return &out
}

// recomputedFingerprint is the attacker's tool: the canonical fingerprint of
// a rewritten manifest, as any caller can compute it.
func recomputedFingerprint(t *testing.T, m map[string]any) string {
	t.Helper()
	return manifestFingerprint(manifestFromMap(t, m))
}

// mustJSON converts a typed receipt into the response-map shape the wire
// carries, exactly as json round-trips it.
func mustJSON(t *testing.T, v any) map[string]any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}
