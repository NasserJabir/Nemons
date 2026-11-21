package daemon

// The daemon side of the trusted actor identity (remediation WS-A, tightened
// by remediation 02 WS-A/B). Identity is resolved through
// models.ActorFromParams — trusted integration boundaries only — and every
// agent-facing operation that decides scope goes through actorViewer, which
// returns exactly the boundary-authenticated authorization identity and fails
// closed otherwise. A caller claim is attribution only: it never becomes the
// viewer, and there is no hardcoded identity a request without one falls back
// to (remediation 02 WS-B2 — the former Claude default is gone, not replaced).
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
// request: the boundary-authenticated authorization identity, and nothing
// else. A request whose identity is missing, session-only, or a bare caller
// claim is refused — it never reads under a default or under the label it
// named, and the refusal does not disclose whether any row exists (remediation
// 02 WS-A1/B2). Internal callers (the daemon's own audited paths, the
// sandboxed job surface) carry the in-process marks and keep their system
// view; the HTTP boundary authenticates its own service identity before the
// request ever reaches here.
func (h *Handler) actorViewer(params map[string]any, method string) (string, *Response) {
	if _, ok := params["_internal_call"].(internalCallMark); ok {
		return "", nil // the system acting on its own audited decision
	}
	if _, ok := params["_job_surface"].(jobSurfaceMark); ok {
		return "", nil // sandboxed job surface read
	}
	id := models.ActorFromParams(params).AuthorizationID()
	if id == "" {
		r := errorResponse(fmt.Sprintf(
			"%s: no authorized actor identity — the trusted boundary must resolve the agent identity (env-resolved); a caller claim is attribution only and never authorizes",
			method))
		return "", &r
	}
	return id, nil
}
