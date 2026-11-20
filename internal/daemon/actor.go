package daemon

// The daemon side of the trusted actor identity (remediation WS-A). Identity
// is resolved through models.ActorFromParams — trusted integration boundaries
// only — and every agent-facing operation that decides scope goes through
// actorViewer, which fails closed when the request carries no identity at all.
// The in-process marks are the explicit internal identity: private types no
// external payload can decode, reading as the system exactly as before, at
// their own audited call sites.

import (
	"fmt"

	"github.com/NasserJabir/Nemons/internal/models"
)

// resolveActor returns the request's ActorContext. The identity source is one
// of the models.IdentitySource* values: a boundary-resolved agent, a
// boundary-resolved session, a caller claim (plugin channel), or none.
func (h *Handler) resolveActor(params map[string]any) models.ActorContext {
	return models.ActorFromParams(params)
}

// actorViewer returns the viewer id scope decisions judge for one agent-facing
// request. A request without any identity fails closed — it never reads as the
// system, and the refusal does not disclose whether any row exists. Internal
// callers (the daemon's own audited paths, the sandboxed job surface) carry the
// in-process marks and keep their system view.
func (h *Handler) actorViewer(params map[string]any, method string) (string, *Response) {
	if _, ok := params["_internal_call"].(internalCallMark); ok {
		return "", nil // the system acting on its own audited decision
	}
	if _, ok := params["_job_surface"].(jobSurfaceMark); ok {
		return "", nil // sandboxed job surface read
	}
	a := models.ActorFromParams(params)
	if a.ActorID == "" {
		r := errorResponse(fmt.Sprintf(
			"%s: no actor identity — the client must resolve _source_agent (an env-resolved boundary or a plugin claim)",
			method))
		return "", &r
	}
	return a.ActorID, nil
}

// actorViewerOrDefault is the agent-facing read default: a request that carries
// no identity at all is served as the shared least-privileged local identity
// ("claude") — it sees project and public rows plus its own private rows, and
// never another agent's. The system view stays exclusive to the in-process
// marks, so an identity-less request can never read as the system (remediation
// WS-B). The MCP boundary authenticates every client, so identity-less reads
// arrive only from same-UID operational callers, whose compatibility this
// default preserves. Operations whose whole point is the actor (the pack
// build/verify surface) keep the strict actorViewer refusal instead.
func (h *Handler) actorViewerOrDefault(params map[string]any, method string) string {
	if _, ok := params["_internal_call"].(internalCallMark); ok {
		return "" // the system acting on its own audited decision
	}
	if _, ok := params["_job_surface"].(jobSurfaceMark); ok {
		return "" // sandboxed job surface read
	}
	if id, refusal := h.actorViewer(params, method); refusal == nil {
		return id
	}
	return models.SourceAgentClaude
}
