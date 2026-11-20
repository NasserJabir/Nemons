package daemon

// The manifest verification matrix (remediation WS-D): the fingerprint covers
// the canonical delivered content (id, content hash, position) — never counts
// — and check_pack_loss judges a delivery against the exact build manifest (or
// the deterministic re-assembly), so budget exclusions are never loss.

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
)

func manifestSeed(t *testing.T, h *Handler, contents []string) {
	t.Helper()
	for i, c := range contents {
		row := &models.Learning{
			Category: "decision", Content: c, Project: "/w",
			SourceAgent: "claude", SharingScope: "project", Domain: "ops",
			ModelUsed: "matrix", CreatedAt: time.Now().Add(-time.Duration(len(contents)-i) * time.Hour),
		}
		if _, err := h.store.InsertLearning(row); err != nil {
			t.Fatal(err)
		}
	}
}

func buildPack(t *testing.T, h *Handler, actor, task string, extra map[string]any) map[string]any {
	t.Helper()
	params := map[string]any{"task": task, "project": "/w", "_source_agent": actor}
	for k, v := range extra {
		params[k] = v
	}
	resp := h.Handle(Request{Method: "build_context_pack", Params: params})
	if resp.Error != "" {
		t.Fatalf("build_context_pack: %v", resp.Error)
	}
	var out map[string]any
	if err := json.Unmarshal(resp.Result, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func packManifestOf(t *testing.T, built map[string]any) map[string]any {
	t.Helper()
	m, ok := built["manifest"].(map[string]any)
	if !ok {
		t.Fatalf("build response carries no manifest: %.200s", built)
	}
	return m
}

func checkLoss(t *testing.T, h *Handler, delivered []any, manifest map[string]any, extra map[string]any) map[string]any {
	t.Helper()
	params := map[string]any{
		"task": "loss check", "project": "/w", "delivered": delivered,
		"_source_agent": "claude",
	}
	if manifest != nil {
		params["manifest"] = manifest
	}
	for k, v := range extra {
		params[k] = v
	}
	resp := h.Handle(Request{Method: "check_pack_loss", Params: params})
	if resp.Error != "" {
		t.Fatalf("check_pack_loss: %v", resp.Error)
	}
	var out map[string]any
	if err := json.Unmarshal(resp.Result, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func packItemsFrom(t *testing.T, built map[string]any) []any {
	t.Helper()
	pack, ok := built["pack"].(map[string]any)
	if !ok {
		t.Fatal("build response carries no pack")
	}
	knowledge, ok := pack["knowledge"].([]any)
	if !ok {
		t.Fatal("pack carries no knowledge list")
	}
	return knowledge
}

func deliveredFromItems(items []any) []any {
	out := make([]any, 0, len(items))
	for _, it := range items {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, map[string]any{"id": m["id"], "content": m["content"]})
	}
	return out
}

func fingerprintOf(t *testing.T, built map[string]any) string {
	t.Helper()
	fp, _ := built["fingerprint"].(string)
	if fp == "" {
		t.Fatal("build response carries no fingerprint")
	}
	return fp
}

// Same item count, different content → different fingerprint.
func TestManifestFingerprintCoversContentNotCounts(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate"})
	first := fingerprintOf(t, buildPack(t, h, "claude", "loss check", nil))

	h2, _ := mustHandler(t)
	manifestSeed(t, h2, []string{"claim one approved path MUTATED", "claim two deploy gate"})
	second := fingerprintOf(t, buildPack(t, h2, "claude", "loss check", nil))

	if first == second {
		t.Fatal("different content produced the same fingerprint — counts are not content")
	}
}

// Repeated identical assembly → identical fingerprint (determinism).
func TestManifestFingerprintIsDeterministic(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate", "claim three rollback"})
	first := fingerprintOf(t, buildPack(t, h, "claude", "loss check", nil))
	second := fingerprintOf(t, buildPack(t, h, "claude", "loss check", nil))
	if first != second {
		t.Fatal("identical assembly produced different fingerprints")
	}
}

// A changed task changes the manifest (task hash) even with identical sources.
func TestManifestReflectsTaskChange(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate"})
	a := fingerprintOf(t, buildPack(t, h, "claude", "task A", nil))
	b := fingerprintOf(t, buildPack(t, h, "claude", "task B", nil))
	if a == b {
		t.Fatal("the manifest did not reflect the task change")
	}
}

// Budget-limited pack → no false loss, against both references (re-assembly
// and the presented manifest).
func TestBudgetLimitedDeliveryIsNotLoss(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{
		"claim alpha approved path",
		"claim beta deploy gate wording",
		"claim gamma rollback window",
		"claim delta staging drift",
	})
	// A tight budget limits the delivery to a subset of the eligible pool.
	built := buildPack(t, h, "claude", "loss check", map[string]any{"budget_chars": 60.0})
	items := packItemsFrom(t, built)
	if len(items) == 0 {
		t.Fatal("the budget dropped everything — test inconclusive")
	}
	delivered := deliveredFromItems(items)

	// Without a presented manifest: the deterministic re-assembly reference.
	out := checkLoss(t, h, delivered, nil, map[string]any{"budget_chars": 60.0})
	if out["verdict"] != "lossless" {
		t.Fatalf("budget exclusions were reported as loss (re-assembly reference): %v", out["counters"])
	}
	// With the presented manifest: the exact selection reference.
	out = checkLoss(t, h, delivered, packManifestOf(t, built), nil)
	if out["verdict"] != "lossless" {
		t.Fatalf("budget exclusions were reported as loss (manifest reference): %v", out["counters"])
	}
}

// Missing selected item → loss detected against the manifest.
func TestManifestDetectsMissingSelectedItems(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate"})
	built := buildPack(t, h, "claude", "loss check", nil)
	items := packItemsFrom(t, built)
	if len(items) < 2 {
		t.Fatal("need at least two selected items")
	}
	delivered := deliveredFromItems(items[:len(items)-1]) // drop one selected item
	out := checkLoss(t, h, delivered, packManifestOf(t, built), nil)
	if out["verdict"] != "loss_detected" {
		t.Fatal("a missing selected item was not detected")
	}
	missing, _ := out["missing_ids"].([]any)
	if len(missing) != 1 {
		t.Fatalf("missing_ids = %v, want exactly one", out["missing_ids"])
	}
}

// Altered selected content → alteration detected.
func TestManifestDetectsAlteredItems(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate"})
	built := buildPack(t, h, "claude", "loss check", nil)
	items := packItemsFrom(t, built)
	delivered := deliveredFromItems(items)
	first := delivered[0].(map[string]any)
	first["content"] = first["content"].(string) + " (quietly amended)"
	out := checkLoss(t, h, delivered, packManifestOf(t, built), nil)
	if out["verdict"] != "loss_detected" {
		t.Fatal("an altered selected item was not detected")
	}
	altered, _ := out["altered_ids"].([]any)
	if len(altered) != 1 {
		t.Fatalf("altered_ids = %v, want exactly one", out["altered_ids"])
	}
}

// Injected unauthorized item → injected, never folded into the reference.
func TestManifestDetectsInjectedItems(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path"})
	built := buildPack(t, h, "claude", "loss check", nil)
	delivered := deliveredFromItems(packItemsFrom(t, built))
	delivered = append(delivered, map[string]any{"id": float64(424242), "content": "fabricated claim"})
	out := checkLoss(t, h, delivered, packManifestOf(t, built), nil)
	if out["verdict"] != "loss_detected" {
		t.Fatal("an injected item was not detected")
	}
	injected, _ := out["injected_ids"].([]any)
	if len(injected) != 1 {
		t.Fatalf("injected_ids = %v, want exactly one", out["injected_ids"])
	}
}

// Manifest tampering → verification refuses outright (fingerprint mismatch).
func TestManifestTamperingIsRefused(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path", "claim two deploy gate"})
	built := buildPack(t, h, "claude", "loss check", nil)
	manifest := packManifestOf(t, built)
	delivered := deliveredFromItems(packItemsFrom(t, built))
	// The verifier's item hash is swapped: the presented manifest now claims
	// content the build never selected.
	items := manifest["knowledge"].([]any)
	first := items[0].(map[string]any)
	first["content_hash"] = "deadbeef"
	resp := h.Handle(Request{Method: "check_pack_loss", Params: map[string]any{
		"task": "loss check", "project": "/w", "delivered": delivered,
		"manifest": manifest, "_source_agent": "claude",
	}})
	if resp.Error == "" || !strings.Contains(resp.Error, "fingerprint mismatch") {
		t.Fatalf("a tampered manifest was accepted: %v", resp.Error)
	}
}

// A stale/unknown manifest schema fails verification closed.
func TestManifestUnknownSchemaRefused(t *testing.T) {
	h, _ := mustHandler(t)
	manifestSeed(t, h, []string{"claim one approved path"})
	delivered := []any{map[string]any{"id": float64(1), "content": "x"}}
	resp := h.Handle(Request{Method: "check_pack_loss", Params: map[string]any{
		"task": "loss check", "project": "/w", "delivered": delivered,
		"manifest": map[string]any{"schema_version": "9", "fingerprint": "x", "knowledge": []any{}},
		"_source_agent": "claude",
	}})
	if resp.Error == "" || !strings.Contains(resp.Error, "schema") {
		t.Fatalf("an unknown manifest schema was accepted: %v", resp.Error)
	}
}

// The manifest records the skills by name@version too.
func TestManifestRecordsSkills(t *testing.T) {
	h, _ := mustHandler(t)
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "deploy_gate", "description": "checks the deploy gate",
		"scripts": `[{"name":"run","runtime":"bash","sandbox":"none","schema":"{}","body":"echo gate"}]`,
		"version": "v7", "_source_agent": "claude",
	}, "")
	if resp.Error != "" {
		t.Fatalf("seed cap: %v", resp.Error)
	}
	built := buildPack(t, h, "claude", "loss check", nil)
	manifest := packManifestOf(t, built)
	skills, ok := manifest["skills"].([]any)
	if !ok || len(skills) == 0 {
		t.Fatalf("manifest carries no skills: %v", manifest)
	}
	if !strings.Contains(skills[0].(string), "deploy_gate@") {
		t.Fatalf("skills entry = %v, want name@version", skills[0])
	}
}
