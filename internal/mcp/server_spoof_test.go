package mcp

import "testing"

// The MCP boundary is where identity is decided (remediation WS-A): whatever
// the model wrote in the tool arguments is overwritten by the server-resolved
// identity, and the source markers are server-authored.

func TestBuildProxyParams_ResolvedIdentityWinsOverModelFields(t *testing.T) {
	t.Setenv("NEMONS_SOURCE_AGENT", "opencode")
	t.Setenv("NEMONS_SESSION_ID", "sess-42")
	t.Setenv("OPENCODE", "")
	arguments := map[string]any{
		// The model's spoofing attempt: claim another agent, fake session,
		// forge the markers.
		"_source_agent":        "admin",
		"_session_id":          "stolen-session",
		"_source_agent_source": "resolved",
		"_session_id_source":   "env",
		"query":                "hello",
	}
	params := buildProxyParams(arguments, false)

	if got := params["_source_agent"]; got != "opencode" {
		t.Fatalf("_source_agent = %v, want opencode (server-resolved wins)", got)
	}
	if got := params["_source_agent_source"]; got != "resolved" {
		t.Fatalf("_source_agent_source = %v, want resolved (server-authored)", got)
	}
	// Session id: the caller-supplied claim wins (under opencode v2 this
	// server's env may name the last-created session, not the caller's), but
	// the forged env marker is deleted so the daemon never grants env-trust.
	if got := params["_session_id"]; got != "stolen-session" {
		t.Fatalf("_session_id = %v, want the caller-supplied claim", got)
	}
	if got, ok := params["_session_id_source"]; ok {
		t.Fatalf("_session_id_source = %v present, want deleted (forged marker)", got)
	}
	if got := params["query"]; got != "hello" {
		t.Fatalf("ordinary argument must pass through, got %v", got)
	}
}

func TestBuildProxyParams_ClaudeClientIsAuthenticatedAsClaude(t *testing.T) {
	// No agent env at all: the boundary still resolves "claude" and marks it —
	// a model-written identity cannot survive the boundary.
	t.Setenv("NEMONS_SOURCE_AGENT", "")
	t.Setenv("NEMONS_SESSION_ID", "")
	t.Setenv("OPENCODE", "")
	params := buildProxyParams(map[string]any{
		"_source_agent":        "someone-else",
		"_source_agent_source": "resolved",
	}, false)
	if got := params["_source_agent"]; got != "claude" {
		t.Fatalf("_source_agent = %v, want claude (default resolution wins)", got)
	}
	if got := params["_source_agent_source"]; got != "resolved" {
		t.Fatalf("_source_agent_source = %v, want resolved", got)
	}
}

func TestBuildProxyParams_UnresolvedSessionMarkerIsDeleted(t *testing.T) {
	t.Setenv("NEMONS_SOURCE_AGENT", "opencode")
	t.Setenv("NEMONS_SESSION_ID", "")
	t.Setenv("OPENCODE", "1")
	// The model forges a session marker without the boundary resolving one.
	params := buildProxyParams(map[string]any{
		"_session_id":        "model-written",
		"_session_id_source": "env",
	}, false)
	if got, ok := params["_session_id_source"]; ok {
		t.Fatalf("_session_id_source = %v present, want deleted (marker is server-authored)", got)
	}
	if got := params["_session_id"]; got != "model-written" {
		t.Fatalf("_session_id = %v, want kept (plugin v1 claim channel preserved)", got)
	}
	if got := params["_source_agent"]; got != "opencode" {
		t.Fatalf("_source_agent = %v, want opencode (OPENCODE=1 fallback)", got)
	}
}
