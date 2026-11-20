package models

// The trusted actor identity (remediation WS-A). An agent-facing request acts
// as exactly one ActorContext, resolved from trusted integration boundaries
// only. The model controls the ordinary tool arguments, so any identity field
// it can write is a claim, never a credential. The MCP server is the boundary:
// it resolves the authoritative agent identity and session from its own
// environment (NEMONS_SOURCE_AGENT, NEMONS_SESSION_ID, CLAUDE_SESSION_ID,
// CODEX_THREAD_ID, OPENCODE) and marks what it resolved. A marked field is
// server-authored — the boundary overwrites model-written values together with
// their markers, so a marker in the payload proves the boundary authored it.

const (
	// MarkSessionIDSource carries how _session_id entered the payload. Only
	// SessionIDSourceEnv is trusted (the boundary read it from its env).
	MarkSessionIDSource = "_session_id_source"
	// MarkSourceAgentSource carries how _source_agent entered the payload.
	// Only SourceAgentSourceResolved is trusted (the boundary resolved it).
	MarkSourceAgentSource = "_source_agent_source"

	SessionIDSourceEnv        = "env"
	SourceAgentSourceResolved = "resolved"

	// Identity sources, in decreasing trust.
	IdentitySourceResolved = "resolved"    // boundary-resolved agent identity
	IdentitySourceSession  = "session-env" // boundary-resolved session identity
	IdentitySourceClaim    = "claim"       // caller-supplied attribution (plugin channel)
	IdentitySourceNone     = "none"        // no identity at all — protected operations fail closed
)

// ActorContext is the authenticated identity one request acts as.
type ActorContext struct {
	ActorID        string
	AgentType      string
	SessionID      string
	ProjectID      string
	IdentitySource string
	Authenticated  bool
}

// ActorFromParams resolves the request's actor. Precedence:
//
//  1. A boundary-resolved _source_agent (marked SourceAgentSourceResolved):
//     authenticated; the agent identity is the resolved one. A model-written
//     _source_agent or marker never reaches here — the boundary overwrites
//     both when it resolves an identity and deletes the marker when it does not.
//  2. A boundary-resolved _session_id (marked SessionIDSourceEnv): the session
//     is trusted; the actor id may still come from the claim channel below.
//  3. A caller-supplied _source_agent claim (the opencode plugin v1 channel):
//     attribution only — never authenticated, never privileged.
//
// An empty ActorID means "no identity". Agent-facing reads must fail closed on
// it (the daemon's actorViewer); it is never a system read — system reads take
// the explicit internal identity at their own call sites.
func ActorFromParams(params map[string]any) ActorContext {
	a := ActorContext{IdentitySource: IdentitySourceNone}
	if sa, _ := params["_source_agent"].(string); sa != "" {
		if src, _ := params[MarkSourceAgentSource].(string); src == SourceAgentSourceResolved {
			a.ActorID = NormalizeSourceAgent(sa)
			a.AgentType = a.ActorID
			a.IdentitySource = IdentitySourceResolved
			a.Authenticated = true
		}
	}
	if sid, _ := params["_session_id"].(string); sid != "" {
		if src, _ := params[MarkSessionIDSource].(string); src == SessionIDSourceEnv {
			a.SessionID = sid
			if !a.Authenticated {
				a.IdentitySource = IdentitySourceSession
				a.Authenticated = true
			}
		}
	}
	// The agent type is independent of authentication: a session-authenticated
	// caller still names its agent type through the claim channel (opencode v1
	// plugin), and scope decisions judge the id this returns. Only a resolved
	// marker makes the id itself trusted.
	if a.ActorID == "" {
		if sa, _ := params["_source_agent"].(string); sa != "" {
			a.ActorID = NormalizeSourceAgent(sa)
			a.AgentType = a.ActorID
			if a.IdentitySource == IdentitySourceNone {
				a.IdentitySource = IdentitySourceClaim
			}
		}
	}
	return a
}

// ViewerID is the id scope decisions judge: the actor itself, never a label
// the model chose.
func (a ActorContext) ViewerID() string { return a.ActorID }
