package daemon

// Context engineering: the Context Pack is the artifact handed to a coding
// agent for a specific task. The foundation document draws the hard line
// (memory is not context): memory is accumulated knowledge, retrieval finds
// what is relevant, curation selects and bounds it, and the pack is only what
// a task actually receives. The pack assembles from the governed memory
// through the same server-side scope view every other read uses, so a private
// row never crosses into a pack served to another agent.
//
// Remediation WS-D: the pack carries a manifest — the canonical record of the
// exact selected items (id, content hash, position), the actor/project/task
// context, and the budget — whose fingerprint covers the delivered content,
// not counts. Verification compares the delivery against the manifest (or,
// when none is presented, against the deterministic re-assembly of the same
// request), so budget exclusions are never reported as loss.

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/NasserJabir/Nemons/internal/storage"
	"github.com/NasserJabir/Nemons/internal/textutil"
)

// packManifestVersion gates the manifest shape: a verifier that cannot read
// this version refuses instead of guessing.
const packManifestVersion = "1"

// contextPackCuratedCategories is the curation list: the knowledge categories
// worth carrying into a task's context. Everything else (run notes, tool
// chatter) stays in memory where it belongs — the pack is not a memory dump.
var contextPackCuratedCategories = []string{"gotcha", "decision", "explicit_teaching"}

func contextPackLimit(params map[string]any) int {
	if v, ok := params["max_items"].(float64); ok && v > 0 {
		return int(v)
	}
	return 8
}

// contextPackBudget is the declared per-pack budget (F-015). The development
// study fixed the rule from the context-engineering research: "select before
// you compress" — the budget never truncates an item mid-text (half a claim is
// a false claim); it drops whole items in reverse priority order, and approved
// decisions survive longest. Critical categories sit at the edges of the pack
// (decisions first — the "lost in the middle" finding): ordering is a
// selection rule here, not a cosmetic sort.
type contextPackBudget struct {
	maxItems int
	maxChars int // 0 = uncapped (backward compatible default)
}

func contextPackBudgetFrom(params map[string]any) contextPackBudget {
	b := contextPackBudget{maxItems: contextPackLimit(params)}
	if v, ok := params["budget_chars"].(float64); ok && v > 0 {
		b.maxChars = int(v)
	}
	return b
}

// contextPackPriority: lower ranks out first under budget pressure. The
// decision tier is EARNED by approval provenance — the recorded Source of the
// row (user_stated / agreed_upon are the user's own vetting) — never inferred
// from the category name (remediation 02 WS-F): an llm-extracted decision is
// a claim the governance chain has not seen, so it ranks with teaching, and a
// vetted decision survives budget pressure longest.
func contextPackPriority(item map[string]any) int {
	category, _ := item["category"].(string)
	source, _ := item["source"].(string)
	switch category {
	case "gotcha":
		return 0
	case "explicit_teaching":
		return 1
	case "decision":
		if decisionApprovalProvenance(source) {
			return 2
		}
		return 1
	}
	return -1
}

// decisionApprovalProvenance: the sources that record an actual user
// decision. Everything else (llm_extracted, fork, claude_suggested, empty) is
// unvetted extraction, whatever category the row carries.
func decisionApprovalProvenance(source string) bool {
	switch source {
	case "user_stated", "agreed_upon":
		return true
	}
	return false
}

// selectWithinBudget applies the item cap and the char cap as whole-item
// selection in priority order (newest-first inside a category). Returns the
// selected items in pack order (priority descending, newest first) and the
// drop counters. The caps are judged AFTER priority ranking: an arbitrary
// earlier window must never keep a newer gotcha over an older approved
// decision (remediation WS-E).
func selectWithinBudget(items []map[string]any, b contextPackBudget) ([]map[string]any, int, int) {
	droppedCap, droppedChars := 0, 0
	// Priority-ordered selection: keep the highest-priority newest items first.
	// items arrives newest-first per category interleaved; sort by (priority desc, created desc).
	sorted := make([]map[string]any, len(items))
	copy(sorted, items)
	sort.SliceStable(sorted, func(i, j int) bool {
		pi, pj := contextPackPriority(sorted[i]), contextPackPriority(sorted[j])
		if pi != pj {
			return pi > pj
		}
		return sorted[i]["created_at"].(string) > sorted[j]["created_at"].(string)
	})
	used := 0
	selected := make([]map[string]any, 0, len(sorted))
	for _, it := range sorted {
		content, _ := it["content"].(string)
		cost := len([]rune(content))
		if len(selected) >= b.maxItems {
			droppedCap++
			continue
		}
		if b.maxChars > 0 && used+cost > b.maxChars {
			droppedChars++
			continue
		}
		used += cost
		selected = append(selected, it)
	}
	return selected, droppedCap, droppedChars
}

// packManifestItem is one selected knowledge item as the manifest records it:
// identity, content hash and position — never the content itself.
type packManifestItem struct {
	ID          int64  `json:"id"`
	Category    string `json:"category"`
	ContentHash string `json:"content_hash"`
	Position    int    `json:"position"`
}

// packManifest is the canonical record of what the build selected. The
// fingerprint is a content hash over every field above it (deterministic
// marshalling: fixed field order, sorted skill names) — the delivered pack can
// be proven item-by-item without the audit storing any content. An ordinary
// hash proves integrity against accidental change; it is not a signature.
type packManifest struct {
	SchemaVersion string             `json:"schema_version"`
	Viewer        string             `json:"viewer"`
	Project       string             `json:"project"`
	TaskHash      string             `json:"task_hash"`
	MaxItems      int                `json:"max_items"`
	MaxChars      int                `json:"max_chars"`
	Knowledge     []packManifestItem `json:"knowledge"`
	Skills        []string           `json:"skills"`
	Fingerprint   string             `json:"fingerprint"`
}

// manifestFingerprint recomputes the canonical fingerprint over the manifest
// contents. Both the build and the verifier call this one function, so a
// fingerprint only ever matches a manifest that hashes to it.
func manifestFingerprint(m *packManifest) string {
	cp := *m
	cp.Fingerprint = ""
	raw, err := json.Marshal(cp)
	if err != nil {
		return ""
	}
	return textutil.ContentHash(string(raw))
}

// assembledPack is the build's full outcome: the delivered pack, the manifest
// that records it, and the budget drop counters.
type assembledPack struct {
	Knowledge    []map[string]any
	Skills       []map[string]any
	Manifest     packManifest
	DroppedCap   int
	DroppedChars int
}

// assembleContextPack is the single deterministic assembly path the build and
// the loss check share: the same viewer, task, project and budget always
// produce the same pack and the same manifest (remediation WS-D).
func (h *Handler) assembleContextPack(viewer, task, project string, budget contextPackBudget) (*assembledPack, error) {
	// Retrieval: live knowledge rows for the project, through the scope view.
	rows, err := h.store.GetActiveLearningsFiltered(storage.LearningsFilter{
		Project: project, Viewer: viewer,
	}, 0)
	if err != nil {
		return nil, err
	}
	knowledge := make([]map[string]any, 0, len(rows))
	for _, l := range rows {
		if !curatedCategory(l.Category) {
			continue
		}
		knowledge = append(knowledge, map[string]any{
			"id": l.ID, "category": l.Category, "content": l.Content,
			"source": l.Source,
			"created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	// Budget (F-015 + WS-E): whole-item selection with declared priority —
	// approved decisions survive longest, nothing is truncated mid-text, and
	// priority is evaluated over the FULL eligible pool, never a pre-window.
	selected, droppedCap, droppedChars := selectWithinBudget(knowledge, budget)
	knowledge = selected

	// Skills: the live caps bound to this project (or unbound/user-scoped),
	// listed by name and description — the pack points at skills, it does not
	// inline their script bodies.
	caps, err := h.store.GetActiveLearnings("cap", project, "", "", 0)
	if err != nil {
		return nil, err
	}
	skills := make([]map[string]any, 0, len(caps))
	for i := range caps {
		meta, err := ParseCapMeta(caps[i].Context)
		if err != nil || meta.Name == "" {
			continue
		}
		skills = append(skills, map[string]any{
			"name": meta.Name, "description": meta.Description, "version": meta.Version,
		})
	}
	sort.Slice(skills, func(i, j int) bool {
		return skills[i]["name"].(string) < skills[j]["name"].(string)
	})

	// The manifest: the exact selected items in pack order, with content
	// hashes — the fingerprint proves what was delivered, not how many.
	manifest := packManifest{
		SchemaVersion: packManifestVersion,
		Viewer:        viewer,
		Project:       project,
		TaskHash:      textutil.ContentHash(task),
		MaxItems:      budget.maxItems,
		MaxChars:      budget.maxChars,
		Knowledge:     make([]packManifestItem, 0, len(knowledge)),
		Skills:        make([]string, 0, len(skills)),
	}
	for i, k := range knowledge {
		id, _ := k["id"].(int64)
		cat, _ := k["category"].(string)
		content, _ := k["content"].(string)
		manifest.Knowledge = append(manifest.Knowledge, packManifestItem{
			ID: id, Category: cat, ContentHash: textutil.ContentHash(content), Position: i,
		})
	}
	for _, s := range skills {
		ver, _ := s["version"].(string)
		name, _ := s["name"].(string)
		manifest.Skills = append(manifest.Skills, name+"@"+ver)
	}
	manifest.Fingerprint = manifestFingerprint(&manifest)

	return &assembledPack{
		Knowledge:    knowledge,
		Skills:       skills,
		Manifest:     manifest,
		DroppedCap:   droppedCap,
		DroppedChars: droppedChars,
	}, nil
}

// handleBuildContextPack assembles the pack for one task in one project.
// Retrieval goes through the governed reads (the viewer is the calling agent,
// so private rows resolve exactly as they do everywhere else); curation is
// bounded and priority-ordered; the audit line records the counters and the
// manifest fingerprint — never the content itself. The response carries the
// manifest: the caller presents it back at check_pack_loss for verification.
func (h *Handler) handleBuildContextPack(params map[string]any) Response {
	task, _ := params["task"].(string)
	project, _ := params["project"].(string)
	if len([]rune(task)) == 0 {
		return errorResponse("build_context_pack: 'task' is required — a pack is assembled for a task, not in the abstract")
	}
	if project == "" {
		return errorResponse("build_context_pack: 'project' is required — a pack is scoped to the project the task runs in")
	}
	budget := contextPackBudgetFrom(params)
	viewer, verr := h.actorViewer(params, "build_context_pack")
	if verr != nil {
		return *verr
	}

	pack, err := h.assembleContextPack(viewer, task, project, budget)
	if err != nil {
		return errorResponse(fmt.Sprintf("build_context_pack: %v", err))
	}
	knowledge, skills := pack.Knowledge, pack.Skills

	// Remediation 02 WS-C: the manifest is issued under a server-signed
	// receipt — check_pack_loss verifies authenticity before trusting any
	// presented manifest. A key problem fails the build explicitly; it is
	// never a degraded, unsigned pack.
	receipt, rerr := h.issuePackReceipt(viewer, task, project, &pack.Manifest)
	if rerr != nil {
		return errorResponse(fmt.Sprintf("build_context_pack: %v", rerr))
	}

	skillsBudgetNote := ""
	if budget.maxChars > 0 {
		skillsBudgetNote = "skills list stays name/description only — the char budget applies to knowledge content"
	}

	if err := h.store.RecordCapEvent("context.pack.built", project,
		fmt.Sprintf("task %q: %d knowledge items, %d skills, pack %s",
			truncateForAudit(task, 60), len(knowledge), len(skills), pack.Manifest.Fingerprint[:8])); err != nil {
		return errorResponse(fmt.Sprintf("build_context_pack: %v", err))
	}

	return jsonResponse(map[string]any{
		"task": task, "project": project, "fingerprint": pack.Manifest.Fingerprint,
		"manifest": pack.Manifest,
		"receipt":  receipt,
		"pack": map[string]any{
			"knowledge": knowledge,
			"skills":    skills,
		},
		"counters": map[string]any{
			"knowledge": len(knowledge), "skills": len(skills),
			"knowledge_chars": func() int {
				n := 0
				for _, k := range knowledge {
					c, _ := k["content"].(string)
					n += len([]rune(c))
				}
				return n
			}(),
			"budget_dropped_items": pack.DroppedCap,
			"budget_dropped_chars": pack.DroppedChars,
		},
		"budget": map[string]any{
			"max_items": budget.maxItems, "max_chars": budget.maxChars,
			"rule": "whole-item selection in priority order over the full eligible pool, decisions survive longest, gotcha drops first — nothing is truncated mid-text",
			"note": skillsBudgetNote,
		},
	})
}

func curatedCategory(c string) bool {
	for _, want := range contextPackCuratedCategories {
		if c == want {
			return true
		}
	}
	return false
}

// handleCheckPackLoss verifies a delivered pack (F-020 + remediation WS-D).
// When the caller presents the build's manifest, the delivery is judged
// against exactly what was selected — budget exclusions are not loss, missing
// selected items are, altered content is, and anything the manifest does not
// declare is injected. A manifest whose fingerprint no longer matches its own
// contents is rejected outright (tamper detection). Without a manifest the
// check falls back to the deterministic re-assembly of the same request — the
// same rule as the build, so the budget exclusions still are not reported as
// loss. The audit line records counters and the verdict, never the content.
func (h *Handler) handleCheckPackLoss(params map[string]any) Response {
	task, _ := params["task"].(string)
	project, _ := params["project"].(string)
	delivered, _ := params["delivered"].([]any)
	if project == "" {
		return errorResponse("check_pack_loss: 'project' is required — loss is checked against one project's governed source")
	}
	if len(delivered) == 0 {
		return errorResponse("check_pack_loss: 'delivered' is required — the pack items the agent actually received, as [{id, content}]")
	}
	viewer, verr := h.actorViewer(params, "check_pack_loss")
	if verr != nil {
		return *verr
	}

	// The reference the delivery is judged against: the presented manifest,
	// or the deterministic re-assembly when none was carried through.
	var expected map[int64]string
	var reference string
	var expectedN int
	if raw, ok := params["manifest"]; ok && raw != nil {
		mb, err := json.Marshal(raw)
		if err != nil {
			return errorResponse(fmt.Sprintf("check_pack_loss: unreadable manifest: %v", err))
		}
		var m packManifest
		if err := json.Unmarshal(mb, &m); err != nil {
			return errorResponse(fmt.Sprintf("check_pack_loss: unreadable manifest: %v", err))
		}
		if m.SchemaVersion != packManifestVersion {
			return errorResponse(fmt.Sprintf("check_pack_loss: manifest schema %q is not supported — refusing to verify against an unknown contract", m.SchemaVersion))
		}
		if m.Fingerprint != manifestFingerprint(&m) {
			return errorResponse("check_pack_loss: manifest fingerprint mismatch — the manifest was altered in transit; refusing verification")
		}
		// Remediation 02 WS-C: authenticity before trust. The manifest is
		// accepted only under a server-issued receipt that binds it to this
		// viewer, project and task and has not expired. An ordinary hash
		// proves integrity, never issuance.
		var receipt *packReceipt
		if rraw, ok := params["receipt"]; ok && rraw != nil {
			rb, err := json.Marshal(rraw)
			if err != nil {
				return errorResponse(fmt.Sprintf("check_pack_loss: unreadable receipt: %v", err))
			}
			receipt = &packReceipt{}
			if err := json.Unmarshal(rb, receipt); err != nil {
				return errorResponse(fmt.Sprintf("check_pack_loss: unreadable receipt: %v", err))
			}
		}
		if verr := h.verifyPackReceipt(receipt, &m, viewer, project, textutil.ContentHash(task)); verr != nil {
			return errorResponse(fmt.Sprintf("check_pack_loss: %v", verr))
		}
		expected = make(map[int64]string, len(m.Knowledge))
		for _, it := range m.Knowledge {
			expected[it.ID] = it.ContentHash
		}
		expectedN = len(expected)
		reference = "manifest"
	} else {
		budget := contextPackBudgetFrom(params)
		pack, err := h.assembleContextPack(viewer, task, project, budget)
		if err != nil {
			return errorResponse(fmt.Sprintf("check_pack_loss: %v", err))
		}
		expected = make(map[int64]string, len(pack.Knowledge))
		for _, it := range pack.Manifest.Knowledge {
			expected[it.ID] = it.ContentHash
		}
		expectedN = len(expected)
		reference = "reassembled"
	}

	missing, altered := []int64{}, []int64{}
	deliveredIDs := map[int64]bool{}
	injected := []any{}
	for _, d := range delivered {
		m, ok := d.(map[string]any)
		if !ok {
			injected = append(injected, d)
			continue
		}
		idF, _ := m["id"].(float64)
		id := int64(idF)
		content, _ := m["content"].(string)
		want, known := expected[id]
		if !known {
			injected = append(injected, id)
		} else if want != textutil.ContentHash(content) {
			altered = append(altered, id)
			deliveredIDs[id] = true
		} else {
			deliveredIDs[id] = true
		}
	}
	for id := range expected {
		if !deliveredIDs[id] {
			missing = append(missing, id)
		}
	}
	sort.Slice(missing, func(i, j int) bool { return missing[i] < missing[j] })
	sort.Slice(altered, func(i, j int) bool { return altered[i] < altered[j] })

	kept := expectedN - len(missing) - len(altered)
	coverage := 0.0
	if expectedN > 0 {
		coverage = float64(kept) / float64(expectedN)
	}
	loss := len(missing) > 0 || len(altered) > 0 || len(injected) > 0

	verdict := "lossless"
	if loss {
		verdict = "loss_detected"
	}
	if err := h.store.RecordCapEvent("context.loss.checked", project,
		fmt.Sprintf("task %q: reference %s, expected %d, missing %d, altered %d, injected %d — %s",
			truncateForAudit(task, 60), reference, expectedN, len(missing), len(altered), len(injected), verdict)); err != nil {
		return errorResponse(fmt.Sprintf("check_pack_loss: %v", err))
	}

	return jsonResponse(map[string]any{
		"task": task, "project": project, "verdict": verdict,
		"reference":      reference,
		"coverage_ratio": coverage,
		"counters": map[string]any{
			"expected": expectedN, "delivered": len(delivered),
			"missing": len(missing), "altered": len(altered), "injected": len(injected),
		},
		"missing_ids":  missing,
		"altered_ids":  altered,
		"injected_ids": injected,
		"rule":         "exact content-hash match against the verified manifest (or the deterministic re-assembly) — budget exclusions are not loss",
	})
}

func truncateForAudit(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
