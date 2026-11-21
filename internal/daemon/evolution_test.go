package daemon

// Evolution gates: stale citations are flagged, never auto-fixed; a proposal
// comes only from a validated, evidence-backed, asset-attributed failure and
// lands as a governance ask — the gate decides, nothing changes directly.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
)

func seedCitedRow(t *testing.T, h *Handler, project, file, hash string) int64 {
	t.Helper()
	id, err := h.store.InsertLearning(&models.Learning{
		Category: "decision", Content: "cites " + file, Project: project,
		CreatedAt: time.Now(), ModelUsed: "test",
		SourceFile: file, SourceHash: hash,
	})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestCheckCitationsFlagsChangedSource(t *testing.T) {
	h, _ := mustHandler(t)
	dir := t.TempDir()
	f := filepath.Join(dir, "spec.md")
	if err := os.WriteFile(f, []byte("v1"), 0o600); err != nil {
		t.Fatal(err)
	}
	sum := sha256Hex([]byte("v1"))
	id := seedCitedRow(t, h, dir, f, sum)
	resp := h.Handle(Request{Method: "check_citations", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved",
		"project": dir}})
	m := unpack(t, resp.Result)
	if m["fresh"].(float64) != 1 || m["stale"].(float64) != 0 {
		t.Fatalf("fresh citation flagged stale: %v", m)
	}
	if err := os.WriteFile(f, []byte("v2 changed"), 0o600); err != nil {
		t.Fatal(err)
	}
	resp = h.Handle(Request{Method: "check_citations", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved",
		"project": dir}})
	m = unpack(t, resp.Result)
	if m["stale"].(float64) != 1 {
		t.Fatalf("changed source not flagged: %v", m)
	}
	stale := m["stale_rows"].([]any)
	if stale[0].(map[string]any)["reason"].(string) != "hash mismatch" {
		t.Errorf("wrong reason: %v", stale[0])
	}
	_ = id
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func TestCheckCitationsAuditsStale(t *testing.T) {
	h, s := mustHandler(t)
	dir := t.TempDir()
	f := filepath.Join(dir, "gone.md")
	seedCitedRow(t, h, dir, f, "deadbeef")
	h.Handle(Request{Method: "check_citations", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved",
		"project": dir}})
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "citation.stale" {
			found = true
		}
	}
	if !found {
		t.Error("no citation.stale audit line")
	}
}

func TestProposeFromExperienceGateConditions(t *testing.T) {
	h, s := mustHandler(t)
	ctx, _ := json.Marshal(ExperienceMeta{Outcome: "failure", Attribution: "SKILL",
		Evidence: "cap name check rejects valid names", Validated: false})
	id, err := h.store.InsertLearning(&models.Learning{
		Category: "experience", Content: "cap fails", Project: "/w",
		Context: string(ctx), CreatedAt: time.Now(), ModelUsed: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if resp := h.Handle(Request{Method: "propose_from_experience", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved",
		"id": float64(id), "target": "cap-name-check"}}); resp.Error == "" {
		t.Fatal("an unvalidated failure became a proposal")
	}
	ctx2, _ := json.Marshal(ExperienceMeta{Outcome: "failure", Attribution: "SKILL",
		Evidence: "cap name check rejects valid names", Validated: true})
	id2, _ := h.store.InsertLearning(&models.Learning{
		Category: "experience", Content: "cap fails validated", Project: "/w",
		Context: string(ctx2), CreatedAt: time.Now(), ModelUsed: "test"})
	resp := h.Handle(Request{Method: "propose_from_experience", Params: map[string]any{
		"id": float64(id2), "target": "cap-name-check", "_source_agent": "gpt", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("valid proposal refused: %v", resp.Error)
	}
	m := unpack(t, resp.Result)
	if m["proposed"] != true {
		t.Errorf("proposal not recorded: %v", m)
	}
	// Idempotent: the second call meets the existing ask.
	resp2 := h.Handle(Request{Method: "propose_from_experience", Params: map[string]any{
		"id": float64(id2), "target": "cap-name-check", "_source_agent": "gpt", "_source_agent_source": "resolved"}})
	if resp2.Error != "" {
		t.Fatalf("duplicate proposal errored: %v", resp2.Error)
	}
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "experience.proposed" {
			found = true
		}
	}
	if !found {
		t.Error("no experience.proposed audit line")
	}
}

func TestProposeFromExperienceRefusesNonAssetCauses(t *testing.T) {
	h, _ := mustHandler(t)
	ctx, _ := json.Marshal(ExperienceMeta{Outcome: "failure", Attribution: "MODEL",
		Evidence: "model gave wrong answer", Validated: true})
	id, err := h.store.InsertLearning(&models.Learning{
		Category: "experience", Content: "model failure", Project: "/w",
		Context: string(ctx), CreatedAt: time.Now(), ModelUsed: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if resp := h.Handle(Request{Method: "propose_from_experience", Params: map[string]any{"_source_agent": "claude", "_source_agent_source": "resolved",
		"id": float64(id), "target": "anything"}}); resp.Error == "" {
		t.Fatal("a MODEL-attributed failure proposed an asset change")
	}
}
