package main

// cmd_governance.go — the operator's local surface for governance (remediation
// 02 WS-D). The daemon's MCP tools let a model ASK for a governed operation,
// but deciding is the human operator's act: this command tree is how an
// authorized operator inspects pending asks and closes them, without the
// token ever reaching a model-facing surface. The token is read from stdin or
// the NEMONS_OPERATOR_TOKEN environment (never argv — process listings are
// shared), never printed, never logged, and never returned by any daemon
// response.

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/NasserJabir/Nemons/internal/storage"
)

func runGovernance(args []string) {
	if len(args) == 0 {
		governanceUsage()
		os.Exit(2)
	}
	switch args[0] {
	case "status":
		governanceStatus(args[1:])
	case "approvals":
		if len(args) < 2 {
			governanceUsage()
			os.Exit(2)
		}
		switch args[1] {
		case "list":
			governanceApprovalsList(args[2:])
		case "show":
			if len(args) < 3 {
				fmt.Fprintln(os.Stderr, "usage: nemons governance approvals show <key>")
				os.Exit(2)
			}
			governanceApprovalsShow(args[2])
		case "decide":
			if len(args) < 4 {
				fmt.Fprintln(os.Stderr, "usage: nemons governance approvals decide <key> --decision allow|deny")
				os.Exit(2)
			}
			governanceApprovalsDecide(args[2:])
		default:
			governanceUsage()
			os.Exit(2)
		}
	case "operator":
		if len(args) < 2 {
			governanceUsage()
			os.Exit(2)
		}
		switch args[1] {
		case "rotate-token":
			governanceRotateOperatorToken(args[2:])
		default:
			governanceUsage()
			os.Exit(2)
		}
	case "pack-key":
		if len(args) >= 2 && args[1] == "rotate" {
			governanceRotatePackKey()
			return
		}
		governanceUsage()
		os.Exit(2)
	default:
		governanceUsage()
		os.Exit(2)
	}
}

func governanceUsage() {
	fmt.Fprintln(os.Stderr, `usage:
  nemons governance status
  nemons governance approvals list
  nemons governance approvals show <key>
  nemons governance approvals decide <key> --decision allow|deny
  nemons governance operator rotate-token   (recovery / rotation; confirms on stdin)
  nemons governance pack-key rotate         (invalidates outstanding pack receipts)

The operator token is read from NEMONS_OPERATOR_TOKEN or stdin — never argv,
never printed. See docs/remediation/02/OPERATOR_GUIDE.md.`)
}

// governanceStore opens the operator's store. Read-only commands use
// OpenReadOnly semantics where they need them; deciding and rotation need the
// writable handle.
func governanceStore(writable bool) *storage.Store {
	dir := nemonsDataDir()
	var s *storage.Store
	var err error
	if writable {
		s, err = storage.Open(filepath.Join(dir, "nemons.db"))
	} else {
		s, err = storage.OpenReadOnly(filepath.Join(dir, "nemons.db"))
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "governance: open store: %v\n", err)
		os.Exit(1)
	}
	return s
}

// readOperatorToken fetches the operator token from the environment or stdin.
// It is never echoed, never stored, and never appears in argv.
func readOperatorToken() string {
	if tok := os.Getenv("NEMONS_OPERATOR_TOKEN"); tok != "" {
		return tok
	}
	fmt.Fprint(os.Stderr, "operator token: ")
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		fmt.Fprintln(os.Stderr, "governance: no operator token supplied")
		os.Exit(1)
	}
	return strings.TrimSpace(line)
}

// governanceDecideCore is the audited decision path the CLI drives: token
// check, then the store's idempotent decision. Kept separate from printing so
// the tests can drive the exact behavior the operator exercises.
func governanceDecideCore(s *storage.Store, key, decision, token string) error {
	if !s.OperatorTokenOK(token) {
		return errors.New("invalid operator token — the decision was not recorded")
	}
	return s.DecideApproval(key, decision, "operator:cli")
}

func governanceStatus(args []string) {
	s := governanceStore(false)
	defer s.Close()
	pending, err := s.PendingApprovals()
	if err != nil {
		fmt.Fprintf(os.Stderr, "governance: %v\n", err)
		os.Exit(1)
	}
	// Presence only: the status output never carries the token itself.
	tokenPresent := s.OperatorToken() != ""
	fmt.Printf("operator token configured: %v\n", tokenPresent)
	fmt.Printf("pending approvals: %d\n", len(pending))
	for _, a := range pending {
		fmt.Printf("  %s  %s  caller=%s surface=%s expires=%s\n",
			a.Key, a.Method, a.Caller, a.Surface, a.ExpiresAt)
	}
}

func governanceApprovalsList(args []string) {
	s := governanceStore(false)
	defer s.Close()
	pending, err := s.PendingApprovals()
	if err != nil {
		fmt.Fprintf(os.Stderr, "governance: %v\n", err)
		os.Exit(1)
	}
	if len(pending) == 0 {
		fmt.Println("no pending approvals")
		return
	}
	for _, a := range pending {
		fmt.Printf("%s  %s  caller=%s surface=%s requested=%s expires=%s\n",
			a.Key, a.Method, a.Caller, a.Surface, a.RequestedAt, a.ExpiresAt)
	}
}

func governanceApprovalsShow(key string) {
	s := governanceStore(false)
	defer s.Close()
	a, err := s.ApprovalForKey(key)
	if err != nil || a == nil {
		fmt.Fprintf(os.Stderr, "governance: no approval for key %q\n", key)
		os.Exit(1)
	}
	fmt.Printf("key:        %s\nmethod:     %s\ncaller:     %s\nsurface:    %s\nstatus:     %s\ndecision:   %s\nrequested:  %s\ndecided:    %s\nexpires:    %s\n",
		a.Key, a.Method, a.Caller, a.Surface, a.Status, a.Decision, a.RequestedAt, a.DecidedAt, a.ExpiresAt)
}

func governanceApprovalsDecide(args []string) {
	key := args[0]
	fsDecision := ""
	for i := 1; i < len(args); i++ {
		if args[i] == "--decision" && i+1 < len(args) {
			fsDecision = args[i+1]
			i++
		}
	}
	if fsDecision != "allow" && fsDecision != "deny" {
		fmt.Fprintln(os.Stderr, `governance: --decision must be "allow" or "deny"`)
		os.Exit(2)
	}
	s := governanceStore(true)
	defer s.Close()
	token := readOperatorToken()
	if err := governanceDecideCore(s, key, fsDecision, token); err != nil {
		fmt.Fprintf(os.Stderr, "governance: %v\n", err)
		os.Exit(1)
	}
	a, err := s.ApprovalForKey(key)
	if err != nil || a == nil {
		fmt.Fprintf(os.Stderr, "governance: decision recorded but the row vanished: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("%s decided: %s\n", key, a.Decision)
}

// governanceRotateOperatorToken is the recovery path for a lost or corrupted
// token: an explicit, confirmed, audited regeneration. It runs where the
// operator runs — a local process with store access — never through the
// daemon surface an agent can reach.
func governanceRotateOperatorToken(args []string) {
	confirm := ""
	for _, a := range args {
		if a == "--yes" {
			confirm = "yes"
		}
	}
	if confirm == "" {
		fmt.Fprintln(os.Stderr, "this invalidates the current operator token immediately. type `rotate` to confirm:")
		line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		if strings.TrimSpace(line) != "rotate" {
			fmt.Fprintln(os.Stderr, "governance: aborted")
			os.Exit(1)
		}
	}
	s := governanceStore(true)
	defer s.Close()
	if _, err := s.RotateOperatorToken(); err != nil {
		fmt.Fprintf(os.Stderr, "governance: rotation failed: %v\n", err)
		os.Exit(1)
	}
	// The new token is delivered exactly once, on this terminal — printed by
	// the rotation itself, never by status, never logged, never sent anywhere.
	fmt.Println("operator token rotated. the new token follows; store it in the operator's secret store now:")
	fmt.Println(s.OperatorToken())
}

// governanceRotatePackKey drives the pack receipt signing key rotation (WS-C):
// an explicit operator action whose documented contract is that outstanding
// receipts become unverifiable.
func governanceRotatePackKey() {
	s := governanceStore(true)
	defer s.Close()
	if err := s.RotatePackSigningKey(); err != nil {
		fmt.Fprintf(os.Stderr, "governance: pack key rotation failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("pack receipt signing key rotated. outstanding receipts no longer verify; rebuild packs to re-issue them.")
}
