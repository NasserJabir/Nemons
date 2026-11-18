package daemon

// The documented-upgrades rule: a connected upgrade that claims an agent
// identity cites where its change came from — learning:/session:/text: — and
// the citation is verified before the row moves. v1 cites nothing (no
// predecessor); the disk sync cites its manifest by construction; the
// system/operator path audits through its own channels; the internal paths
// cite their own repair and proposal.

import (
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/carsteneu/yesmem/internal/models"
)

const capScriptV1 = `[{"name":"run","runtime":"bash","sandbox":"none","schema":"{\"type\":\"object\"}","body":"echo v1"}]`
const capScriptV2 = `[{"name":"run","runtime":"bash","sandbox":"none","schema":"{\"type\":\"object\"}","body":"echo v2"}]`

func seedCapV1(t *testing.T, h *Handler, name string) {
	t.Helper()
	resp := h.handleSaveCapFrom(map[string]any{
		"name": name, "description": "v1",
		"scripts": capScriptV1, "_source_agent": "claude",
	}, "")
	if resp.Error != "" {
		t.Fatalf("seed v1 %s: %v", name, resp.Error)
	}
}

func seedAliveLearning(t *testing.T, h *Handler, content string) int64 {
	t.Helper()
	id, err := h.store.InsertLearning(&models.Learning{
		Category: "explicit_teaching", Content: content, Project: "/w",
		CreatedAt: time.Now(), ModelUsed: "test",
	})
	if err != nil {
		t.Fatalf("seed learning: %v", err)
	}
	return id
}

func TestCapV1NeedsNoCitation(t *testing.T) {
	h, _ := mustHandler(t)
	seedCapV1(t, h, "cite_seed_cap")
}

func TestCapConnectedUpgradeWithoutCitationRefused(t *testing.T) {
	h, _ := mustHandler(t)
	seedCapV1(t, h, "cite_refused_cap")
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "cite_refused_cap", "description": "v2",
		"scripts": capScriptV2, "_source_agent": "claude",
	}, "")
	if resp.Error == "" {
		t.Fatal("an upgrade landed without a citation")
	}
	if !strings.Contains(resp.Error, "citation") {
		t.Errorf("refusal %q does not name the citation", resp.Error)
	}
	// Nothing moved: the row still reads v1.
	rows, _ := h.store.GetActiveLearnings("cap", "", "", "", 0)
	if len(rows) != 1 || !strings.Contains(rows[0].Content, "v1") {
		t.Errorf("active rows = %d, want the untouched v1", len(rows))
	}
}

func TestCapSystemUpgradeWithoutAgentIdentityIsExempt(t *testing.T) {
	h, _ := mustHandler(t)
	seedCapV1(t, h, "cite_system_cap")
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "cite_system_cap", "description": "v2 from the operator path",
		"scripts": capScriptV2,
	}, "")
	if resp.Error != "" {
		t.Fatalf("system-path upgrade refused: %v", resp.Error)
	}
}

func TestCapUpgradeWithAliveLearningCitationLands(t *testing.T) {
	h, s := mustHandler(t)
	seedCapV1(t, h, "cite_ok_cap")
	id := seedAliveLearning(t, h, "the note that asked for v2")
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "cite_ok_cap", "description": "v2",
		"scripts": capScriptV2, "_source_agent": "claude",
		"citation": "learning:" + strconv.FormatInt(id, 10),
	}, "")
	if resp.Error != "" {
		t.Fatalf("cited upgrade refused: %v", resp.Error)
	}
	rows, _ := h.store.GetActiveLearnings("cap", "", "", "", 0)
	meta, err := ParseCapMeta(rows[0].Context)
	if err != nil {
		t.Fatalf("parse meta: %v", err)
	}
	if meta.Citation != "learning:"+strconv.FormatInt(id, 10) {
		t.Errorf("stored citation = %q, want learning:%d", meta.Citation, id)
	}
	events, _ := s.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "cap.upgrade" && strings.Contains(e.Detail, "v1 to v2") {
			found = true
		}
	}
	if !found {
		t.Error("no cap.upgrade audit line naming the versions and the citation")
	}
}

func TestCapUpgradeCitingASupersededLearningRefused(t *testing.T) {
	h, s := mustHandler(t)
	seedCapV1(t, h, "cite_dead_cap")
	id1 := seedAliveLearning(t, h, "first note")
	id2 := seedAliveLearning(t, h, "second note")
	if err := s.SupersedeLearning(id1, id2, "replaced"); err != nil {
		t.Fatalf("supersede: %v", err)
	}
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "cite_dead_cap", "description": "v2",
		"scripts": capScriptV2, "_source_agent": "claude",
		"citation": "learning:" + strconv.FormatInt(id1, 10),
	}, "")
	if resp.Error == "" {
		t.Fatal("an upgrade cited a superseded row and landed")
	}
	if !strings.Contains(resp.Error, "superseded") {
		t.Errorf("refusal %q does not name the supersession", resp.Error)
	}
}

func TestCapUpgradeCitingUnknownRowsRefused(t *testing.T) {
	h, _ := mustHandler(t)
	seedCapV1(t, h, "cite_unknown_cap")
	for _, cite := range []string{"learning:999999", "session:no-such-session", "team:notes", "text:"} {
		resp := h.handleSaveCapFrom(map[string]any{
			"name": "cite_unknown_cap", "description": "v2",
			"scripts": capScriptV2, "_source_agent": "claude",
			"citation": cite,
		}, "")
		if resp.Error == "" {
			t.Fatalf("citation %q was accepted", cite)
		}
	}
}

func TestCapDiskSyncUpgradeExemptFromCitation(t *testing.T) {
	h, _ := mustHandler(t)
	seedCapV1(t, h, "cite_sync_cap")
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "cite_sync_cap", "description": "v2 from disk",
		"scripts": capScriptV2,
	}, "/caps/cite_sync_cap/CAP.md")
	if resp.Error != "" {
		t.Fatalf("disk sync refused: %v", resp.Error)
	}
	// The audit line still records the upgrade, with the provenance note.
	events, _ := h.store.GovernanceSnapshot()
	found := false
	for _, e := range events {
		if e.Kind == "cap.upgrade" && strings.Contains(e.Detail, "manifest provenance") {
			found = true
		}
	}
	if !found {
		t.Error("the sync upgrade wrote no provenance line")
	}
}
