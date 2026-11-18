package daemon

// The sandboxed job surface is its own governed surface: the socket marks what
// it carries, the gate judges marked calls under job.<method>, an agent-surface
// grant does not admit the job surface, and a raw decodable value cannot move a
// call onto (or off) the marked surface.

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/carsteneu/yesmem/internal/storage"
)

func jobRememberParams() map[string]any {
	return map[string]any{"text": "job write", "project": "/w", "_source_agent": "codex"}
}

// admitJobCall opens and approves the ask a job packet owes, so a test can
// drive the surface's ordinary path on top of a standing allow. The key is
// parsed from the refusal itself rather than re-derived: the digest runs after
// project resolution inside Handle, which the caller cannot repeat exactly.
func admitJobCall(t *testing.T, h *Handler, method string, params map[string]any) {
	t.Helper()
	ask := h.handleJobSocket(Request{Method: method, Params: params})
	if ask.Error == "" || !strings.Contains(ask.Error, "governance ask") {
		t.Fatalf("expected the governed ask first, got %q", ask.Error)
	}
	fields := strings.Fields(ask.Error)
	if len(fields) < 4 {
		t.Fatalf("ask refusal %q does not name the key", ask.Error)
	}
	if err := h.store.DecideApproval(fields[2], storage.ApprovalAllow, "operator"); err != nil {
		t.Fatalf("admit the job call: %v", err)
	}
}

func TestJobSocketJudgesUnderTheJobMethod(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.handleJobSocket(Request{Method: "remember", Params: jobRememberParams()})
	if resp.Error == "" || !strings.Contains(resp.Error, "job.remember") {
		t.Fatalf("refusal = %q, want the job.remember ask", resp.Error)
	}
	key := strings.Fields(resp.Error)[2]
	a, _ := s.ApprovalForKey(key)
	if a == nil {
		t.Fatalf("no approval for the job packet %s", key)
	}
	if a.Method != "job.remember" || a.Surface != "job" {
		t.Errorf("row = %s on %s, want job.remember on the job surface", a.Method, a.Surface)
	}
}

func TestAgentGrantDoesNotOpenTheJobSurface(t *testing.T) {
	h, s := mustHandler(t)
	params := map[string]any{"text": "shared packet", "project": "/w", "_source_agent": "codex"}
	_ = h.Handle(Request{Method: "remember", Params: params}) // agent ask
	agentKey := storage.GateKey("remember", params)
	if err := s.DecideApproval(agentKey, storage.ApprovalAllow, "operator"); err != nil {
		t.Fatalf("agent decide: %v", err)
	}
	resp := h.handleJobSocket(Request{Method: "remember", Params: params})
	if resp.Error == "" || !strings.Contains(resp.Error, "job.remember") {
		t.Fatalf("job resend = %q, want its own ask: the agent grant is not a job grant", resp.Error)
	}
	jobKey := storage.GateKey("job.remember", params)
	if agentKey == jobKey {
		t.Fatal("both surfaces hashed to the same ask")
	}
}

func TestRawDecodableValueCannotPretendTheMark(t *testing.T) {
	h, _ := mustHandler(t)
	// The client sends JSON; whatever it puts under the mark key decodes into a
	// plain value, never into the private struct. Round-trip the params the way
	// a socket frame would arrive and keep the decoded map.
	raw, _ := json.Marshal(jobRememberParams())
	var decoded map[string]any
	_ = json.Unmarshal(raw, &decoded)
	decoded["_job_surface"] = map[string]any{}
	resp := h.gateRequest(Request{Method: "remember", Params: decoded})
	if resp == nil {
		t.Fatal("a raw value moved the call off the agent surface: it must not")
	}
	if !strings.Contains(resp.Error, "ask") || !strings.Contains(resp.Error, " for remember") {
		t.Errorf("refusal = %q, want the agent-surface remember ask", resp.Error)
	}
}

func TestJobAskKeyDiffersFromTheAgentAskKey(t *testing.T) {
	h, _ := mustHandler(t)
	params := jobRememberParams()
	_ = h.handleJobSocket(Request{Method: "remember", Params: params})
	_ = h.Handle(Request{Method: "remember", Params: params})
	job := storage.GateKey("job.remember", params)
	agent := storage.GateKey("remember", params)
	if job == agent {
		t.Fatal("the two surfaces shared one ask")
	}
}

func TestJobDenyRefusesTheJobSurface(t *testing.T) {
	h, s := mustHandler(t)
	params := jobRememberParams()
	ask := h.handleJobSocket(Request{Method: "remember", Params: params})
	if ask.Error == "" {
		t.Fatal("the job write ran ungoverned")
	}
	key := strings.Fields(ask.Error)[2]
	if err := s.DecideApproval(key, storage.ApprovalDeny, "operator"); err != nil {
		t.Fatalf("job decide: %v", err)
	}
	resp := h.handleJobSocket(Request{Method: "remember", Params: params})
	if resp.Error == "" || !strings.Contains(resp.Error, "governance refused") {
		t.Errorf("job resend = %q, want the governance refusal", resp.Error)
	}
}

func TestJobAllowAdmitsTheJobCall(t *testing.T) {
	h, s := mustHandler(t)
	params := jobRememberParams()
	ask := h.handleJobSocket(Request{Method: "remember", Params: params})
	if ask.Error == "" {
		t.Fatal("the job write ran ungoverned")
	}
	key := strings.Fields(ask.Error)[2]
	if err := s.DecideApproval(key, storage.ApprovalAllow, "operator"); err != nil {
		t.Fatalf("job decide: %v", err)
	}
	resp := h.handleJobSocket(Request{Method: "remember", Params: params})
	if resp.Error != "" {
		t.Fatalf("approved job call refused: %v", resp.Error)
	}
	ls, err := s.GetActiveLearnings("explicit_teaching", "/w", "", "", 10)
	if err != nil || len(ls) == 0 {
		t.Errorf("learnings = %d (%v), want the approved job write stored", len(ls), err)
	}
}

func TestJobMarkSurvivesOnlyInProcess(t *testing.T) {
	// The mark is set by the socket handler alone; nothing else in the daemon
	// produces it, and no decode can. This is what keeps the surface assignment
	// in-process.
	var in any = jobSurfaceMark{}
	if _, ok := in.(jobSurfaceMark); !ok {
		t.Fatal("the mark type changed shape")
	}
	frame, _ := json.Marshal(map[string]any{"_job_surface": struct{}{}})
	var decoded map[string]any
	_ = json.Unmarshal(frame, &decoded)
	if _, ok := decoded["_job_surface"].(jobSurfaceMark); ok {
		t.Fatal("a decoded value presented itself as the job mark")
	}
}
