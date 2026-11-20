package daemon

// The knowledge-and-memory stage: chat transcripts become a searchable memory
// surface (scoped to the project the sessions ran in), and the knowledge base
// answers for its own health — one call reports the counters an operator
// needs.

import "fmt"

func transcriptLimit(params map[string]any) int {
	if v, ok := params["limit"].(float64); ok && v > 0 {
		return int(v)
	}
	return 20
}

// handleSearchTranscripts searches chat transcripts for all the terms the
// query carries, inside the project's sessions. A transcript is memory the
// project already holds, so it does not cross projects.
func (h *Handler) handleSearchTranscripts(params map[string]any) Response {
	query, _ := params["query"].(string)
	project, _ := params["project"].(string)
	terms := fieldsOf(query)
	if len(terms) == 0 {
		return errorResponse("search_transcripts: 'query' is required")
	}
	hits, err := h.store.SearchTranscripts(project, terms, transcriptLimit(params))
	if err != nil {
		return errorResponse(fmt.Sprintf("search_transcripts: %v", err))
	}
	out := make([]map[string]any, 0, len(hits))
	for _, hit := range hits {
		out = append(out, map[string]any{
			"session_id": hit.SessionID, "role": hit.Role,
			"timestamp": hit.Timestamp, "content": hit.Content,
		})
	}
	return jsonResponse(map[string]any{"query": query, "project": project, "hits": out, "count": len(out)})
}

// handleGetKnowledgeStats reports the knowledge base's counters: live vs
// superseded, per category, per sharing scope, and the busiest projects.
func (h *Handler) handleGetKnowledgeStats(params map[string]any) Response {
	stats, err := h.store.KnowledgeCounts()
	if err != nil {
		return errorResponse(fmt.Sprintf("get_knowledge_stats: %v", err))
	}
	return jsonResponse(stats)
}

func fieldsOf(s string) []string {
	out := []string{}
	cur := ""
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
