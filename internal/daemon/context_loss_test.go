package daemon

// Semantic loss detection tests (F-020) — the development study's eighth
// experiment: a delivered pack is checked claim-by-claim against the governed
// source of truth. The checker re-derives expectations through the same
// server-side scope view, so a private row of another agent is never counted
// as expected — delivering it is an injection signal, not knowledge.

import (
	"encoding/json"
	"testing"
)

func seedAndBuildPack(t *testing.T, h *Handler, contents map[string]string) (Response, []map[string]any) {
	t.Helper()
	ids := map[int64]bool{}
	for cat, content := range contents {
		id := seedPackLearning(t, h, cat, content, "")
		ids[id] = true
	}
	_ = ids
	resp := h.Handle(Request{Method: "build_context_pack", Params: map[string]any{
		"task": "loss check", "project": "/w", "_source_agent": "claude", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("build: %v", resp.Error)
	}
	r := packResult(t, resp)
	knowledge := r["pack"].(map[string]any)["knowledge"].([]any)
	items := make([]map[string]any, 0, len(knowledge))
	for _, k := range knowledge {
		items = append(items, k.(map[string]any))
	}
	return resp, items
}

func callLossCheck(t *testing.T, h *Handler, delivered []map[string]any) map[string]any {
	t.Helper()
	arr := make([]any, 0, len(delivered))
	for _, d := range delivered {
		arr = append(arr, map[string]any{"id": d["id"], "content": d["content"]})
	}
	resp := h.Handle(Request{Method: "check_pack_loss", Params: map[string]any{
		"task": "loss check", "project": "/w", "delivered": arr, "_source_agent": "claude", "_source_agent_source": "resolved"}})
	if resp.Error != "" {
		t.Fatalf("check: %v", resp.Error)
	}
	var m map[string]any
	if err := json.Unmarshal(resp.Result, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return m
}

func TestPackLossRoundtripLossless(t *testing.T) {
	h, _ := mustHandler(t)
	_, items := seedAndBuildPack(t, h, map[string]string{
		"gotcha": "the env file must exist before deploy",
		"decision": "we pin sqlite for the local store",
		"explicit_teaching": "always run the balance test after cap changes",
	})
	m := callLossCheck(t, h, items)
	if m["verdict"] != "lossless" {
		t.Fatalf("full roundtrip must be lossless, got %v (%v)", m["verdict"], m["counters"])
	}
	if m["coverage_ratio"].(float64) != 1.0 {
		t.Fatalf("coverage must be 1.0, got %v", m["coverage_ratio"])
	}
}

func TestPackLossDetectsMissingClaim(t *testing.T) {
	h, _ := mustHandler(t)
	_, items := seedAndBuildPack(t, h, map[string]string{
		"gotcha":   "first claim",
		"decision": "second claim",
	})
	delivered := items[:1] // one claim silently dropped in transit
	m := callLossCheck(t, h, delivered)
	if m["verdict"] != "loss_detected" {
		t.Fatalf("dropped claim must be detected, got %v", m["verdict"])
	}
	if m["counters"].(map[string]any)["missing"].(float64) != 1 {
		t.Fatalf("expected 1 missing, counters: %v", m["counters"])
	}
}

func TestPackLossDetectsAlteredClaim(t *testing.T) {
	h, _ := mustHandler(t)
	_, items := seedAndBuildPack(t, h, map[string]string{
		"gotcha": "the env file must exist before deploy",
	})
	tampered := []map[string]any{{
		"id":      items[0]["id"],
		"content": items[0]["content"].(string) + " (maybe)",
	}}
	m := callLossCheck(t, h, tampered)
	if m["verdict"] != "loss_detected" {
		t.Fatalf("altered claim must be detected, got %v", m["verdict"])
	}
	if m["counters"].(map[string]any)["altered"].(float64) != 1 {
		t.Fatalf("expected 1 altered, counters: %v", m["counters"])
	}
}

func TestPackLossScopeHoldsInjectedPrivateRow(t *testing.T) {
	h, _ := mustHandler(t)
	_, items := seedAndBuildPack(t, h, map[string]string{
		"gotcha": "public-ish project claim",
	})
	// Another agent's private row: never in this caller's expected set.
	privateID := seedPackLearning(t, h, "decision", "agent-two private decision", "agent-two")
	delivered := append([]map[string]any{}, items...)
	delivered = append(delivered, map[string]any{"id": float64(privateID), "content": "agent-two private decision"})
	m := callLossCheck(t, h, delivered)
	if m["counters"].(map[string]any)["injected"].(float64) != 1 {
		t.Fatalf("another agent's private row must count as injected (scope holds), counters: %v", m["counters"])
	}
	if m["verdict"] != "loss_detected" {
		t.Fatalf("injection is loss, got %v", m["verdict"])
	}
}
