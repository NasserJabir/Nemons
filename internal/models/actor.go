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

// The four identity concepts are carried by four distinct channels and must
// never be conflated into one string (remediation 02 WS-A2):
//
//   - Authenticated Actor Identity  → AuthorizationID(): the actor id exactly
//     when a trusted integration boundary authenticated it. This is the only
//     id scope decisions may judge.
//   - Unauthenticated Agent Attribution → AttributionID(): the caller's claimed
//     label, for audit lines and display only — never for scope.
//   - Session Identity → SessionID: the boundary-resolved session (YM-271),
//     distinct from the agent id.
//   - Internal System Identity → the in-process marks in internal/daemon
//     (internalCallMark, jobSurfaceMark): private Go types no external payload
//     can decode, at their own audited call sites.

// AuthorizationID is the identity scope decisions judge: the actor id exactly
// when a trusted integration boundary authenticated it (IdentitySourceResolved
// — the boundary overwrites model-written values, so a resolved marker proves
// boundary authorship). A caller claim never authorizes: the model chose that
// label, and under the trusted-identity contract a claim must never silently
// become an authorization identity, no matter how well it names another agent
// (remediation 02 WS-A1). Session-only authentication authenticates the
// session, not the agent id, so it does not authorize private scope either.
func (a ActorContext) AuthorizationID() string {
	if a.Authenticated && a.IdentitySource == IdentitySourceResolved {
		return a.ActorID
	}
	return ""
}

// AttributionID is the caller's claimed agent label, when it is a claim. It
// exists for audit lines and display: where a claim is recorded it must be
// readable as a claim, never merged into the authorized identity.
func (a ActorContext) AttributionID() string {
	if a.IdentitySource == IdentitySourceClaim {
		return a.ActorID
	}
	return ""
}

// ViewerID is the id scope decisions judge: the actor itself, never a label
// the model chose.
func (a ActorContext) ViewerID() string { return a.ActorID }
