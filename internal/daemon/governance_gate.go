package daemon

// The governance gate wired into the central path. A governed method reads its
// packet's decision inside Handle before the dispatch switch touches anything
// — the same position the unresolved-project refusal occupies, so no handler
// runs past the gate. The evaluator stays a pure read; this wiring is what
// opens the ask, through the audited RequestApproval interface itself, which
// is idempotent per packet, so a caller resending its call cannot stack asks.

import (
	"fmt"
	"time"

	"github.com/NasserJabir/Nemons/internal/models"
	"github.com/NasserJabir/Nemons/internal/storage"
)

// governanceAskTTL bounds an open ask: the expiry sweep (see the approval
// expiry work) closes it later with its own audit event if nobody decides it.
const governanceAskTTL = 24 * time.Hour

// gateRequest judges a request before dispatch. nil means proceed; a Response
// is the refusal the caller receives instead of running the method.
func (h *Handler) gateRequest(req Request) *Response {
	if !storage.IsGovernedMethod(req.Method) {
		return nil
	}
	// A handler with no store cannot read the governance state; fold the gate
	// open there — the wiring tolerance, not a policy decision.
	if h.store == nil {
		return nil
	}
	// The surface rides on the in-process mark: a request the sandboxed job
	// socket carries is judged under job.<method> on the job surface, and its
	// grant lives separately from the agent surface's. The marks are stripped
	// from the digested params — the packet's identity is its visible payload.
	method, surface, params := req.Method, "agent", req.Params
	if _, ok := params["_job_surface"].(jobSurfaceMark); ok {
		method, surface = "job."+req.Method, "job"
		params = withoutInternalMarks(params)
	}
	// The daemon's own upgrade paths (the bash autocorrect, the proposal
	// accept) dispatch save_cap internally. They are not external callers —
	// they are the system acting on its own audited decisions — so they carry
	// the in-process mark and the gate folds open for them, exactly as the
	// job surface's mark works in the other direction.
	if _, ok := params["_internal_call"].(internalCallMark); ok {
		return nil
	}
	caller := models.ActorFromParams(params).ActorID
	d := h.store.EvaluateGovernance(method, caller, surface, params)
	switch d.Action {
	case storage.GateAllow:
		return nil
	case storage.GateDeny:
		r := errorResponse("governance refused the call: " + d.Reason)
		return &r
	default: // ask
		if _, err := h.store.RequestApproval(d.Key, method, caller, surface, governanceAskTTL); err != nil {
			r := errorResponse(fmt.Sprintf("governance ask failed for %s: %v", d.Key, err))
			return &r
		}
		r := errorResponse(fmt.Sprintf(
			"governance ask %s is open for %s: the operator decides it, then resend the call",
			d.Key, method))
		return &r
	}
}

// internalCallMark is the in-process proof that a request is the daemon
// acting on its own audited decision. Like the surface marks it is a private
// empty struct: no JSON payload decodes into it, so an external caller cannot
// borrow the system's pass.
type internalCallMark struct{}

// handleGovernanceDecide is the operator's surface over the approval
// lifecycle: it closes the open ask a key names with allow or deny, through
// the audited store interface. It is not governed by the gate itself (the
// decision authority stands outside the gate it operates — WS-F); it is
// authenticated by the operator token instead.
func (h *Handler) handleGovernanceDecide(params map[string]any) Response {
	// The decision authority is the operator, authenticated by the token the
	// store generated at first open (WS-F). A model-controlled tool argument
	// never holds it, so a model can ask, but never decide.
	token, _ := params["operator_token"].(string)
	if !h.store.OperatorTokenOK(token) {
		return errorResponse("governance_decide: operator authorization required — present the operator token; the deciding authority is never model-controlled")
	}
	key, _ := params["key"].(string)
	decision, _ := params["decision"].(string)
	decider, _ := params["decider"].(string)
	if key == "" {
		return errorResponse("governance_decide: key is required")
	}
	if err := h.store.DecideApproval(key, decision, decider); err != nil {
		return errorResponse(fmt.Sprintf("governance_decide: %v", err))
	}
	a, err := h.store.ApprovalForKey(key)
	if err != nil {
		return errorResponse(fmt.Sprintf("governance_decide: %v", err))
	}
	return jsonResponse(map[string]any{"key": key, "status": a.Status, "decision": a.Decision})
}

// withoutInternalMarks copies params minus the in-process mark keys. The marks
// are control flow, not payload; keying a job call on them would make its ask
// depend on plumbing the caller never sees.
func withoutInternalMarks(params map[string]any) map[string]any {
	out := make(map[string]any, len(params))
	for k, v := range params {
		if k == "_job_surface" || k == "_job_caller" {
			continue
		}
		out[k] = v
	}
	return out
}

// claimMethods are the memory paths that take a project claim from the caller.
// A bound agent's claim on any of them is judged against the binding before
// the handler runs (the E3b rejection is a server decision).
var claimMethods = map[string]bool{
	"get_learnings": true,
	"remember":      true,
	"hybrid_search": true,
	"briefing":      true,
}

// claimMethod reports whether the method carries a project claim the binding
// judges. The since variant resolves through get_learnings' own handler.
func claimMethod(method string) bool { return claimMethods[method] }

// handleGovernanceBind is the operator's surface for the agent↔project
// bindings. The op is governed (the packet takes its ask first); the bind
// lands with its own binding.upsert audit event in the same transaction.
func (h *Handler) handleGovernanceBind(params map[string]any) Response {
	agent, _ := params["agent"].(string)
	project, _ := params["project"].(string)
	if err := h.store.BindAgent(agent, project); err != nil {
		return errorResponse(fmt.Sprintf("governance_bind: %v", err))
	}
	b, err := h.store.AgentBindingFor(agent)
	if err != nil {
		return errorResponse(fmt.Sprintf("governance_bind: %v", err))
	}
	return jsonResponse(map[string]any{
		"agent": b.Agent, "project": b.Project, "canonical_project": b.CanonicalProject,
	})
}

// handleGovernancePersona is the operator's surface over the per-agent
// persona spaces: set/clear a trait override or a directive override for one
// agent, each write landing with its persona.agent_override audit line.
func (h *Handler) handleGovernancePersona(params map[string]any) Response {
	agent, _ := params["agent"].(string)
	kind, _ := params["kind"].(string)
	action, _ := params["action"].(string)
	dimension, _ := params["dimension"].(string)
	key, _ := params["key"].(string)
	value, _ := params["value"].(string)
	if agent == "" {
		return errorResponse("governance_persona: agent is required")
	}
	switch {
	case kind == "trait" && action == "set":
		if err := h.store.SetAgentPersonaTrait(agent, dimension, key, value); err != nil {
			return errorResponse(fmt.Sprintf("governance_persona: %v", err))
		}
	case kind == "trait" && action == "clear":
		if err := h.store.ClearAgentPersonaTrait(agent, dimension, key); err != nil {
			return errorResponse(fmt.Sprintf("governance_persona: %v", err))
		}
	case kind == "directive" && action == "set":
		if err := h.store.SetAgentPersonaDirective(agent, value); err != nil {
			return errorResponse(fmt.Sprintf("governance_persona: %v", err))
		}
	case kind == "directive" && action == "clear":
		if err := h.store.ClearAgentPersonaDirective(agent); err != nil {
			return errorResponse(fmt.Sprintf("governance_persona: %v", err))
		}
	case kind == "traits" && action == "get":
		traits, err := h.store.GetResolvedPersonaTraits(agent, 0)
		if err != nil {
			return errorResponse(fmt.Sprintf("governance_persona: %v", err))
		}
		return jsonResponse(map[string]any{"agent": agent, "traits": traits})
	case kind == "directive" && action == "get":
		d, err := h.store.GetResolvedPersonaDirective(agent)
		if err != nil {
			return errorResponse(fmt.Sprintf("governance_persona: %v", err))
		}
		return jsonResponse(map[string]any{"agent": agent, "directive": d})
	default:
		return errorResponse("governance_persona: kind is trait|directive|traits and action is set|clear|get")
	}
	return jsonResponse(map[string]any{"agent": agent, "kind": kind, "action": action, "ok": true})
}
