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

	"github.com/carsteneu/yesmem/internal/storage"
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
	caller, _ := params["_source_agent"].(string)
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
