package daemon

// The sandboxed job surface is its own governed surface: the socket marks what
// it carries, the gate judges marked calls under job.<method>, an agent-surface
// grant does not admit the job surface, and a raw decodable value cannot move a
// call onto (or off) the marked surface.

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/carsteneu/yesmem/internal/storage"
)

func jobDecideParams() map[string]any {
	return map[string]any{"key": "abcd1234", "decision": "allow", "decider": "operator", "project": "/w", "_source_agent": "codex"}
}

// admitJobCall opens and approves the ask a job packet owes. The key is parsed
// from the refusal itself rather than re-derived: the digest runs after project
// resolution inside Handle, which the caller cannot repeat exactly.
func admitJobCall(t *testing.T, h *Handler, method string, params map[string]any) {
	t.Helper()
	ask := h.handleJobSocket(Request{Method: method, Params: params})
	if ask.Error == "" || !strings.Contains(ask.Error, "governance ask") {
		t.Fatalf("expected the governed ask first, got %q", ask.Error)
	}
	key := strings.Fields(ask.Error)[2]
	if err := h.store.DecideApproval(key, storage.ApprovalAllow, "operator"); err != nil {
		t.Fatalf("admit the job call: %v", err)
	}
}

func TestJobSocketJudgesUnderTheJobMethod(t *testing.T) {
	h, s := mustHandler(t)
	resp := h.handleJobSocket(Request{Method: "governance_decide", Params: jobDecideParams()})
	if resp.Error == "" || !strings.Contains(resp.Error, "job.governance_decide") {
		t.Fatalf("refusal = %q, want the job.governance_decide ask", resp.Error)
	}
	key := strings.Fields(resp.Error)[2]
	a, _ := s.ApprovalForKey(key)
	if a == nil {
		t.Fatalf("no approval for the job packet %s", key)
	}
	if a.Method != "job.governance_decide" || a.Surface != "job" {
		t.Errorf("row = %s on %s, want job.governance_decide on the job surface", a.Method, a.Surface)
	}
}

func TestAgentGrantDoesNotOpenTheJobSurface(t *testing.T) {
	h, s := mustHandler(t)
	params := jobDecideParams()
	agentAsk := h.Handle(Request{Method: "governance_decide", Params: params})
	if agentAsk.Error == "" {
		t.Fatal("the agent-surface call ran ungoverned")
	}
	agentKey := strings.Fields(agentAsk.Error)[2]
	if err := s.DecideApproval(agentKey, storage.ApprovalAllow, "operator"); err != nil {
		t.Fatalf("agent decide: %v", err)
	}
	resp := h.handleJobSocket(Request{Method: "governance_decide", Params: params})
	if resp.Error == "" || !strings.Contains(resp.Error, "job.governance_decide") {
		t.Fatalf("job resend = %q, want its own ask: the agent grant is not a job grant", resp.Error)
	}
}

func TestRawDecodableValueCannotPretendTheMark(t *testing.T) {
	h, _ := mustHandler(t)
	// The client sends JSON; whatever it puts under the mark key decodes into a
	// plain value, never into the private struct. Round-trip the params the way
	// a socket frame would arrive and keep the decoded map.
	raw, _ := json.Marshal(jobDecideParams())
	var decoded map[string]any
	_ = json.Unmarshal(raw, &decoded)
	decoded["_job_surface"] = map[string]any{}
	resp := h.gateRequest(Request{Method: "governance_decide", Params: decoded})
	if resp == nil {
		t.Fatal("a raw value moved the call onto the job surface: it must not")
	}
	if strings.Contains(resp.Error, "job.governance_decide") {
		t.Errorf("refusal = %q, want the agent-surface judging (no job. prefix)", resp.Error)
	}
}

func TestJobAskKeyDiffersFromTheAgentAskKey(t *testing.T) {
	h, _ := mustHandler(t)
	jobAsk := h.handleJobSocket(Request{Method: "governance_decide", Params: jobDecideParams()})
	agentAsk := h.Handle(Request{Method: "governance_decide", Params: jobDecideParams()})
	if jobAsk.Error == "" || agentAsk.Error == "" {
		t.Fatal("one of the surfaces ran ungoverned")
	}
	job := strings.Fields(jobAsk.Error)[2]
	agent := strings.Fields(agentAsk.Error)[2]
	if job == agent {
		t.Fatal("the two surfaces shared one ask")
	}
}

func TestJobDenyRefusesTheJobSurface(t *testing.T) {
	h, s := mustHandler(t)
	params := jobDecideParams()
	ask := h.handleJobSocket(Request{Method: "governance_decide", Params: params})
	if ask.Error == "" {
		t.Fatal("the job call ran ungoverned")
	}
	key := strings.Fields(ask.Error)[2]
	if err := s.DecideApproval(key, storage.ApprovalDeny, "operator"); err != nil {
		t.Fatalf("job decide: %v", err)
	}
	resp := h.handleJobSocket(Request{Method: "governance_decide", Params: params})
	if resp.Error == "" || !strings.Contains(resp.Error, "governance refused") {
		t.Errorf("job resend = %q, want the governance refusal", resp.Error)
	}
}

func TestJobAllowAdmitsTheJobCall(t *testing.T) {
	h, s := mustHandler(t)
	// The target ask waits open; the admitted job call is what closes it.
	if _, err := s.RequestApproval("abcd1234", "remember", "claude", "agent", time.Minute); err != nil {
		t.Fatalf("seed ask: %v", err)
	}
	admitJobCall(t, h, "governance_decide", jobDecideParams())
	resp := h.handleJobSocket(Request{Method: "governance_decide", Params: jobDecideParams()})
	if resp.Error != "" {
		t.Fatalf("approved job call refused: %v", resp.Error)
	}
	a, _ := s.ApprovalForKey("abcd1234")
	if a.Decision != storage.ApprovalAllow {
		t.Errorf("the job call's decision did not land: %+v", a)
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

func TestInternalCallMarkFoldsTheGateOpen(t *testing.T) {
	h, s := mustHandler(t)
	// The daemon's own upgrade paths carry the internal mark; the gate folds
	// open for them even though the method is governed.
	params := map[string]any{"key": "abcd1234", "decision": "allow", "_internal_call": internalCallMark{}}
	resp := h.gateRequest(Request{Method: "governance_decide", Params: params})
	if resp != nil {
		t.Fatalf("an internal call owed an ask: %v", resp.Error)
	}
	// The mark is a private type: a decoded value cannot present itself as it.
	frame, _ := json.Marshal(map[string]any{"_internal_call": map[string]any{}})
	var decoded map[string]any
	_ = json.Unmarshal(frame, &decoded)
	if resp := h.gateRequest(Request{Method: "governance_decide", Params: decoded}); resp == nil {
		t.Fatal("a decoded value borrowed the system's pass")
	}
	_ = s
}
