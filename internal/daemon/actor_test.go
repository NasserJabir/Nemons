package daemon

// The daemon side of the trusted actor identity (remediation WS-A): the
// actorViewer fails closed on identity-less requests, the in-process marks
// are the only system identity, and claims never authenticate.

import (
	"strings"
	"testing"
)

func TestActorViewerFailsClosedWithoutIdentity(t *testing.T) {
	h, _ := mustHandler(t)
	id, refusal := h.actorViewer(map[string]any{}, "get_learnings")
	if id != "" || refusal == nil {
		t.Fatal("a request without any identity must fail closed")
	}
	if !strings.Contains(refusal.Error, "no actor identity") {
		t.Errorf("refusal %q does not name the missing identity", refusal.Error)
	}
}

func TestActorViewerFailsClosedOnMalformedIdentity(t *testing.T) {
	h, _ := mustHandler(t)
	// An identity that is not a string, or an empty one, is no identity.
	for _, bad := range []any{42, "", nil} {
		id, refusal := h.actorViewer(map[string]any{"_source_agent": bad}, "get_learnings")
		if id != "" || refusal == nil {
			t.Fatalf("malformed identity %v must fail closed", bad)
		}
	}
}

func TestActorViewerInternalMarksAreTheSystemIdentity(t *testing.T) {
	h, _ := mustHandler(t)
	// The internal call and job surface marks are private types no external
	// payload decodes into; they read as the system (empty viewer) at their
	// own audited call sites.
	id, refusal := h.actorViewer(map[string]any{"_internal_call": internalCallMark{}}, "save_cap")
	if id != "" || refusal != nil {
		t.Fatalf("internal call mark = %q/%v, want the system view", id, refusal)
	}
	id, refusal = h.actorViewer(map[string]any{"_job_surface": jobSurfaceMark{}}, "hybrid_search")
	if id != "" || refusal != nil {
		t.Fatalf("job surface mark = %q/%v, want the system view", id, refusal)
	}
}

func TestResolveActor_ClaimNeverAuthenticates(t *testing.T) {
	h, _ := mustHandler(t)
	// The plugin v1 channel supplies _source_agent as a claim: attribution is
	// preserved, but the actor is not authenticated and cannot borrow trust.
	a := h.resolveActor(map[string]any{"_source_agent": "opencode"})
	if a.Authenticated {
		t.Fatal("a claim must never authenticate")
	}
	if a.IdentitySource != "claim" || a.ActorID != "opencode" {
		t.Fatalf("actor = %+v, want claim/opencode", a)
	}
}

func TestResolveActor_ResolvedMarkerIsAuthenticated(t *testing.T) {
	h, _ := mustHandler(t)
	a := h.resolveActor(map[string]any{
		"_source_agent":       "opencode",
		"_source_agent_source": "resolved",
	})
	if !a.Authenticated || a.IdentitySource != "resolved" || a.ActorID != "opencode" {
		t.Fatalf("actor = %+v, want authenticated resolved opencode", a)
	}
}
