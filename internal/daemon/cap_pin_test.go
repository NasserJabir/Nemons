package daemon

// The pin lifecycle: a pinned name refuses agent-driven upgrades, the lift
// reopens it, and a rollback restores the standing content as a new live row
// with the marker naming the row it came from. Every step writes its own audit
// line.

import (
	"strings"
	"testing"
)

func TestCapPinAndRollback(t *testing.T) {
	h, s := mustHandler(t)
	seedCapV1(t, h, "pin_test_cap")

	// Pin: the row freezes.
	if resp := h.Handle(Request{Method: "pin_cap", Params: map[string]any{"name": "pin_test_cap"}}); resp.Error != "" {
		t.Fatalf("pin_cap: %v", resp.Error)
	}
	// An agent-driven upgrade of the pinned name is refused until the lift.
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "pin_test_cap", "description": "v2",
		"scripts": capScriptV2, "_source_agent": "claude",
		"citation": "text:try to rewrite a held script",
	}, "")
	if resp.Error == "" || !strings.Contains(resp.Error, "pinned") {
		t.Fatalf("pinned upgrade = %q, want the pin refusal", resp.Error)
	}

	// The lift reopens the name; the upgrade lands.
	if resp := h.Handle(Request{Method: "unpin_cap", Params: map[string]any{"name": "pin_test_cap"}}); resp.Error != "" {
		t.Fatalf("unpin_cap: %v", resp.Error)
	}
	if resp := h.handleSaveCapFrom(map[string]any{
		"name": "pin_test_cap", "description": "v2",
		"scripts": capScriptV2, "_source_agent": "claude",
		"citation": "text:the held script is open again",
	}, ""); resp.Error != "" {
		t.Fatalf("upgrade after lift: %v", resp.Error)
	}
	before, _ := s.GetActiveLearnings("cap", "", "", "", 0)
	if len(before) != 1 || !strings.Contains(before[0].Content, "v2") {
		t.Fatalf("active caps = %d, want the single v2 row", len(before))
	}

	// Rollback restores the standing content as a NEW live row.
	if resp := h.Handle(Request{Method: "rollback_cap", Params: map[string]any{"name": "pin_test_cap"}}); resp.Error != "" {
		t.Fatalf("rollback_cap: %v", resp.Error)
	}
	after, _ := s.GetActiveLearnings("cap", "", "", "", 0)
	if len(after) != 1 {
		t.Fatalf("active caps after rollback = %d, want exactly one live row", len(after))
	}
	meta, err := ParseCapMeta(after[0].Context)
	if err != nil {
		t.Fatalf("parse meta: %v", err)
	}
	if meta.RollbackFrom == 0 {
		t.Error("the restored row carries no rollback_from marker")
	}
	if meta.Version != 3 {
		t.Errorf("restored version = %d, want 3 (the counter keeps climbing)", meta.Version)
	}

	// The trail covers the whole lifecycle.
	events, _ := s.GovernanceSnapshot()
	for _, kind := range []string{"cap.pin", "cap.unpin", "cap.rollback"} {
		found := false
		for _, e := range events {
			if e.Kind == kind && e.Key == "pin_test_cap" {
				found = true
			}
		}
		if !found {
			t.Errorf("no %s event for pin_test_cap", kind)
		}
	}
}

func TestCapPinRefusalKeepsTheDiskSyncPath(t *testing.T) {
	h, _ := mustHandler(t)
	seedCapV1(t, h, "pin_sync_cap")
	if resp := h.Handle(Request{Method: "pin_cap", Params: map[string]any{"name": "pin_sync_cap"}}); resp.Error != "" {
		t.Fatalf("pin_cap: %v", resp.Error)
	}
	// The sync's own provenance (the manifest) is not an agent-driven rewrite:
	// a repair from the file the row came from still lands.
	resp := h.handleSaveCapFrom(map[string]any{
		"name": "pin_sync_cap", "description": "v2 from disk",
		"scripts": capScriptV2,
	}, "/caps/pin_sync_cap/CAP.md")
	if resp.Error != "" {
		t.Fatalf("pinned-name sync refused: %v", resp.Error)
	}
}

func TestCapRollbackOfUnknownNameRefused(t *testing.T) {
	h, _ := mustHandler(t)
	if resp := h.Handle(Request{Method: "rollback_cap", Params: map[string]any{"name": "no_such_cap"}}); resp.Error == "" {
		t.Fatal("a rollback of an unknown name ran")
	}
}
