package daemon

// The operator token never reaches a model-facing surface (remediation 02
// WS-D): the daemon's decide surface authenticates by the token but echoes
// nothing of it, refused or successful, and the CLI is the only retrieval
// path. The MCP tool table carries no governance_decide (verified by the
// registration sweep in the server tests).

import (
	"strings"
	"testing"
)

func TestGovernanceDecideNeverLeaksTheToken(t *testing.T) {
	h, _ := mustHandler(t)
	key := "gate.test-method:/w/leak"
	if _, err := h.store.RequestApproval(key, "test_method", "agent-x", "agent", 72*3600*1e9); err != nil {
		t.Fatal(err)
	}
	token := h.store.OperatorToken()

	resp := h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": key, "decision": "allow", "operator_token": token, "decider": "operator:cli"}})
	if resp.Error != "" {
		t.Fatalf("the authorized decision was refused: %s", resp.Error)
	}
	if strings.Contains(string(resp.Result), token) || strings.Contains(resp.Error, token) {
		t.Fatal("the decide response leaked the token")
	}
	resp = h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"key": key, "decision": "allow", "operator_token": "wrong"}})
	if resp.Error == "" || strings.Contains(resp.Error, token) {
		t.Fatal("the refusal leaked the token")
	}
	// No parameter of the daemon surface regenerates or reveals the token.
	resp = h.Handle(Request{Method: "governance_decide", Params: map[string]any{
		"operator_token": token, "action": "reveal"}})
	if resp.Error == "" || strings.Contains(resp.Error+string(resp.Result), token) {
		t.Fatal("an unknown action on the decide surface leaked or echoed the token")
	}
}
