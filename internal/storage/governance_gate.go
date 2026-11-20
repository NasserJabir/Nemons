package storage

// The enforcement gate: a pure read decision over the governance state. For a
// governed method the gate derives the request packet's own key (the first
// eight hex characters of the packet digest) and reads what the approvals
// table holds for that key. It never writes: an ask is opened by the caller
// through RequestApproval, not by the evaluation itself, so the same packet
// always evaluates to the same decision and the evaluator cannot move the
// state it judges.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Gate actions. allow proceeds, ask means the caller must open (or wait on)
// the approval keyed by Decision.Key, deny refuses the call outright.
const (
	GateAllow = "allow"
	GateAsk   = "ask"
	GateDeny  = "deny"
)

// governedMethods is the registry of methods the gate judges. The list grows
// only by a documented decision; everything outside it passes untouched.
// The registry starts with the governance operations themselves and grows
// only as the chain adds governed surfaces (the binding, the persona
// overrides). The memory-facing operations keep their upstream behaviour
// byte for byte: a governed ask on them would change what upstream callers
// see, which the stage record forbids.
var governedMethods = map[string]bool{
	"governance_decide":  true,
	"governance_bind":    true,
	"governance_persona": true,
}

// GovernedMethods reports the governed registry (for the handler wiring and
// the tests).
func GovernedMethods() []string {
	out := make([]string, 0, len(governedMethods))
	for m := range governedMethods {
		out = append(out, m)
	}
	sort.Strings(out)
	return out
}

// IsGovernedMethod reports whether the gate judges this method.
func IsGovernedMethod(method string) bool {
	return governedMethods[method]
}

// GateKey derives the request packet's governance key: the first eight hex
// characters of the digest over the method and its canonical parameters. The
// same packet always hashes to the same ask, and a packet that differs in any
// parameter hashes to a different one — the key is the packet's own identity,
// not a counter.
func GateKey(method string, params map[string]any) string {
	h := sha256.New()
	h.Write([]byte(method))
	h.Write([]byte{0})
	h.Write([]byte(canonicalParamsJSON(params)))
	return hex.EncodeToString(h.Sum(nil))[:8]
}

// canonicalParamsJSON renders the params deterministically: keys sorted,
// values JSON-encoded, so map iteration order cannot move the digest.
func canonicalParamsJSON(params map[string]any) string {
	if len(params) == 0 {
		return "{}"
	}
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kj, _ := json.Marshal(k)
		vj, _ := json.Marshal(params[k])
		b.Write(kj)
		b.WriteByte(':')
		b.Write(vj)
	}
	b.WriteByte('}')
	return b.String()
}

// GateDecision is the evaluation's outcome.
type GateDecision struct {
	Action     string `json:"action"`
	Key        string `json:"key"`
	ApprovalID int64  `json:"approval_id"`
	Reason     string `json:"reason"`
}

// EvaluateGovernance judges one request. Governed methods read their packet's
// approval row: no row means the caller owes an ask, an open row means the ask
// still waits, a deny decision refuses, and an allow decision is the standing
// grant that admits the packet. Ungoverned methods pass with no read at all.
// A surface-prefixed judged method (job.<method>) is registered by its bare
// name — the registry lists methods, the judged name carries the surface.
func (s *Store) EvaluateGovernance(method, caller, surface string, params map[string]any) GateDecision {
	key := GateKey(method, params)
	registered := method
	if bare, ok := strings.CutPrefix(method, "job."); ok {
		registered = bare
	}
	if !IsGovernedMethod(registered) {
		return GateDecision{Action: GateAllow, Key: key, Reason: "method is not governed"}
	}
	row, err := s.ApprovalForKey(key)
	if err != nil {
		return GateDecision{Action: GateDeny, Key: key,
			Reason: fmt.Sprintf("governance read failed: %v", err)}
	}
	if row == nil {
		return GateDecision{Action: GateAsk, Key: key,
			Reason: fmt.Sprintf("no approval stands for %s on %s; open the ask keyed %s", method, surface, key)}
	}
	switch {
	case row.Status == ApprovalOpen:
		return GateDecision{Action: GateAsk, Key: key, ApprovalID: row.ID,
			Reason: fmt.Sprintf("the ask for %s (%s) is still open; decide it or wait", method, key)}
	case row.Decision == ApprovalDeny:
		return GateDecision{Action: GateDeny, Key: key, ApprovalID: row.ID,
			Reason: fmt.Sprintf("the ask for %s (%s) was denied", method, key)}
	case row.Decision == ApprovalAllow:
		return GateDecision{Action: GateAllow, Key: key, ApprovalID: row.ID,
			Reason: fmt.Sprintf("standing allow for %s (%s)", method, key)}
	default:
		return GateDecision{Action: GateDeny, Key: key, ApprovalID: row.ID,
			Reason: fmt.Sprintf("the ask for %s (%s) is in state %q", method, key, row.Status)}
	}
}
