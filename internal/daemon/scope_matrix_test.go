package daemon

// The adversarial scope matrix (remediation WS-B): one matrix over every
// agent-facing read path — direct ID, list, history, query_facts, hybrid
// search (both lanes) and the pack surface — proving that a private row of
// one agent is unreachable for another agent no matter which door it knocks
// on, that unknown scopes are shared-nothing, and that an identity-less
// request never reads as the system.

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/embedding"
	"github.com/NasserJabir/Nemons/internal/models"
)

// insertMatrixRows seeds the adversarial corpus through the real save path
// (so the FTS index and every derived store stay consistent). Row order:
// [0] alice-private, [1] bob-private, [2] project, [3] public, [4] unknown-scope.
func insertMatrixRows(t *testing.T, h *Handler) []int64 {
	t.Helper()
	now := time.Now().Add(-48 * time.Hour) // beyond the result cooldown, so the gates do not drop fresh seeds
	rows := []*models.Learning{
		{Category: "decision", Content: "alice private kaboom secret-xyz vault", Project: "/w", SourceAgent: "alice", SharingScope: "private", Domain: "sec", ModelUsed: "matrix", CreatedAt: now},
		{Category: "decision", Content: "bob private quixotic noodle drawer", Project: "/w", SourceAgent: "bob", SharingScope: "private", Domain: "sec", ModelUsed: "matrix", CreatedAt: now},
		{Category: "decision", Content: "deploy checklist staging rollback steps", Project: "/w", SourceAgent: "alice", SharingScope: "project", Domain: "ops", ModelUsed: "matrix", CreatedAt: now},
		{Category: "decision", Content: "public runbook announcement everyone", Project: "/w", SourceAgent: "alice", SharingScope: "public", Domain: "ops", ModelUsed: "matrix", CreatedAt: now},
		{Category: "decision", Content: "weird scope orphan row", Project: "/w", SourceAgent: "alice", SharingScope: "weird", Domain: "ops", ModelUsed: "matrix", CreatedAt: now},
	}
	var ids []int64
	for _, l := range rows {
		id, err := h.store.InsertLearning(l)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

func matrixHandle(h *Handler, actor, method string, params map[string]any) Response {
	if actor != "" {
		params["_source_agent"] = actor
		params["_source_agent_source"] = "resolved"
	}
	return h.Handle(Request{Method: method, Params: params})
}

// matrixSeedVector indexes the seeded rows into the embedding store, so the
// vector lane actually has hits for both actors to be judged on.
func matrixSeedVector(t *testing.T, h *Handler, ids []int64) {
	t.Helper()
	store, err := embedding.NewVectorStore(h.store.DB(), 384)
	if err != nil {
		t.Fatal(err)
	}
	provider := &testEmbedProvider{dims: 384}
	indexer := embedding.NewIndexer(provider, store)
	h.SetEmbedding(indexer, store, provider)
	ctx := context.Background()
	for _, id := range ids {
		var content string
		if err := h.store.DB().QueryRow(`SELECT content FROM learnings WHERE id = ?`, id).Scan(&content); err != nil {
			t.Fatal(err)
		}
		indexer.Index(ctx, strconv.FormatInt(id, 10), content, nil)
	}
}

func matrixContains(resp Response, needle string) bool {
	return strings.Contains(string(resp.Result), needle)
}

// idToken is how a row id appears inside a JSON result payload regardless of
// whether the envelope carries content or only references.
func idToken(id int64) string {
	return `"` + strconv.FormatInt(id, 10) + `"`
}

func TestScopeMatrix_DirectIDAndList(t *testing.T) {
	h, _ := mustHandlerWithEmbedding(t)
	ids := insertMatrixRows(t, h)
	alicePriv, weird := ids[0], ids[4]

	// A reads A-private: allow.
	resp := matrixHandle(h, "alice", "get_learnings", map[string]any{"id": float64(alicePriv)})
	if resp.Error != "" || !matrixContains(resp, "kaboom") {
		t.Fatalf("alice reading own private row: %v", resp.Error)
	}
	// B reads A-private by ID: the not-found semantics — existence unconfirmed.
	resp = matrixHandle(h, "bob", "get_learnings", map[string]any{"id": float64(alicePriv)})
	if resp.Error == "" || matrixContains(resp, "kaboom") {
		t.Fatalf("bob reading alice's private row must read as missing, got %v / %v", resp.Error, string(resp.Result))
	}
	// Unknown scope: shared-nothing for everyone.
	for _, actor := range []string{"alice", "bob"} {
		resp = matrixHandle(h, actor, "get_learnings", map[string]any{"id": float64(weird)})
		if resp.Error == "" {
			t.Fatalf("%s read an unknown-scope row", actor)
		}
	}
	// List: project rows pass for every viewer; foreign private rows never.
	resp = matrixHandle(h, "bob", "get_learnings", map[string]any{"project": "/w", "limit": float64(50)})
	if !matrixContains(resp, "deploy checklist") {
		t.Fatal("bob lost the project rows")
	}
	if matrixContains(resp, "kaboom") {
		t.Fatal("bob's list leaked alice's private row")
	}
	resp = matrixHandle(h, "alice", "get_learnings", map[string]any{"project": "/w", "limit": float64(50)})
	if !matrixContains(resp, "kaboom") {
		t.Fatal("alice lost her own private row in the list")
	}
}

func TestScopeMatrix_HistoryDoesNotDisclose(t *testing.T) {
	h, _ := mustHandlerWithEmbedding(t)
	ids := insertMatrixRows(t, h)
	alicePriv := ids[0]
	// B walks the history of A-private: the chain omits the hidden row instead
	// of confirming it.
	resp := matrixHandle(h, "bob", "get_learnings", map[string]any{"id": float64(alicePriv), "history": true})
	if matrixContains(resp, "kaboom") {
		t.Fatal("history leaked alice's private row to bob")
	}
	resp = matrixHandle(h, "alice", "get_learnings", map[string]any{"id": float64(alicePriv), "history": true})
	if !matrixContains(resp, "kaboom") {
		t.Fatal("history lost alice's own row")
	}
}

func TestScopeMatrix_QueryFactsEnforcesScope(t *testing.T) {
	h, _ := mustHandlerWithEmbedding(t)
	ids := insertMatrixRows(t, h)
	alicePriv := ids[0]
	resp := matrixHandle(h, "bob", "query_facts", map[string]any{"domain": "sec"})
	if matrixContains(resp, "kaboom") || matrixContains(resp, idToken(alicePriv)) {
		t.Fatal("query_facts leaked alice's private row to bob")
	}
	resp = matrixHandle(h, "alice", "query_facts", map[string]any{"domain": "sec"})
	if !matrixContains(resp, "kaboom") {
		t.Fatal("query_facts lost alice's own private row")
	}
}

func TestScopeMatrix_HybridSearchBothLanesEnforceScope(t *testing.T) {
	h, _ := mustHandlerWithEmbedding(t)
	ids := insertMatrixRows(t, h)
	alicePriv := ids[0]
	matrixSeedVector(t, h, ids)

	// The response envelope may quote the query term itself (hints), so the
	// leak is judged on the row's id token, never on a query word.
	resp := matrixHandle(h, "bob", "hybrid_search", map[string]any{"query": "secret-xyz", "limit": float64(10)})
	if matrixContains(resp, idToken(alicePriv)) {
		t.Fatal("hybrid_search leaked alice's private row to bob")
	}
	resp = matrixHandle(h, "bob", "vector_search", map[string]any{"query": "secret-xyz", "limit": float64(10)})
	if matrixContains(resp, idToken(alicePriv)) {
		t.Fatal("vector_search leaked alice's private row to bob")
	}
	// Alice keeps her own row through both lanes.
	resp = matrixHandle(h, "alice", "hybrid_search", map[string]any{"query": "secret-xyz", "limit": float64(10)})
	if !matrixContains(resp, idToken(alicePriv)) {
		t.Fatalf("hybrid_search lost alice's own row: %v %s", resp.Error, string(resp.Result))
	}
	resp = matrixHandle(h, "alice", "vector_search", map[string]any{"query": "secret-xyz", "limit": float64(10)})
	if !matrixContains(resp, idToken(alicePriv)) {
		t.Fatalf("vector_search lost alice's own row: %v %.200s", resp.Error, string(resp.Result))
	}
}

func TestScopeMatrix_PackSurfaceFailsClosedWithoutIdentity(t *testing.T) {
	h, _ := mustHandlerWithEmbedding(t)
	insertMatrixRows(t, h)
	// No identity at all: the pack surface refuses instead of reading as the
	// system (the strict actorViewer).
	resp := matrixHandle(h, "", "build_context_pack", map[string]any{"task": "t", "project": "/w"})
	if resp.Error == "" || !strings.Contains(resp.Error, "no authorized actor identity") {
		t.Fatalf("build_context_pack without identity: %v", resp.Error)
	}
	resp = matrixHandle(h, "", "check_pack_loss", map[string]any{
		"project":  "/w",
		"delivered": []any{map[string]any{"id": float64(1), "content": "x"}},
	})
	if resp.Error == "" || !strings.Contains(resp.Error, "no authorized actor identity") {
		t.Fatalf("check_pack_loss without identity: %v", resp.Error)
	}
	// The four inherited read paths default to the least-privileged local
	// identity — they never read as the system, but they stay usable.
	resp = matrixHandle(h, "", "get_learnings", map[string]any{"project": "/w", "limit": float64(50)})
	if resp.Error == "" || !strings.Contains(resp.Error, "no authorized actor identity") {
		t.Fatalf("identity-less list must be refused (no fallback identity exists): %v", resp.Error)
	}
}

func TestScopeMatrix_InternalMarkIsTheOnlySystemRead(t *testing.T) {
	h, _ := mustHandlerWithEmbedding(t)
	insertMatrixRows(t, h)
	// The in-process mark reads as the system: it sees the private row — and
	// no external payload can decode into the mark (private type).
	params := map[string]any{"project": "/w", "limit": float64(50), "_internal_call": internalCallMark{}}
	resp := h.handleGetLearnings(params)
	if !matrixContains(resp, "kaboom") {
		t.Fatal("the internal system read lost the private row")
	}
}
