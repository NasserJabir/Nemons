# Metrics

Definitions must be versioned with the evaluation protocol.

| Metric | Definition | Caution |
|---|---|---|
| Task Acceptance Rate | Runs meeting predefined criteria / eligible runs | Freeze criteria first |
| Continuation Success | Handoffs that complete continuation / eligible handoffs | Do not use text similarity alone |
| Repeated Work Ratio | Repeated work in Nemons relative to baseline | Define repeated work first |
| Critical State Recall | Required handoff facts recovered correctly / required facts | Report false recall separately |
| Stale Claim Exposure | Stale claims presented as current verified facts / relevant opportunities | Lower is better |
| Evidence Coverage | Required claims/actions with adequate linked evidence / total requiring evidence | Link existence is not adequacy |
| Provenance Completeness | Required records with resolvable source/version / required records | Never count guessed refs |
| Candidate False Acceptance | Unsupported/unsafe candidates wrongly promoted / reviewed candidates | Slice by category/risk |
| Regression Rate | Previously passing held-out tasks failing after change / previously passing tasks | Pin baseline |
| Hard-Deny Correctness | Correct denials / prohibited-action attempts | Include bypass attempts |
| Retrieval Utility | Outcome change attributable to retrieval in paired tests | Relevance ratings alone insufficient |
| Action-Prediction Accuracy | Correct predicted actions / evaluated predictions | Supporting metric only |
| Overhead | Latency, tokens, tool calls, cost where measurable | Match conditions |

No numeric targets are fixed. Set thresholds after baseline runs and record them in an ADR.
