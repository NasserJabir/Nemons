package main

import (
	"os"
	"path/filepath"
	"testing"
)

// ~/.claude/nemons holds the database, config.yaml with the API keys and
// auth_token. nemonsDataDir created it with 0755 (audit 16.10.2026, YM-328), and
// every client runs as the same user, so owner-only mode costs no
// reachability.
func TestNemonsDataDir_IsOwnerOnly(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	dir := nemonsDataDir()
	if want := filepath.Join(home, ".claude", "nemons"); dir != want {
		t.Fatalf("nemonsDataDir() = %q, want %q", dir, want)
	}

	fi, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("stat data dir: %v", err)
	}
	if got := fi.Mode().Perm(); got&0o077 != 0 {
		t.Errorf("data dir mode = %04o, want no group/other bits (0700)", got)
	}
}

// An existing installation already has the directory with 0755; the next CLI
// call has to harden it, otherwise the fix only reaches new installs.
func TestNemonsDataDir_HardensExistingDirectory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	dir := filepath.Join(home, ".claude", "nemons")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := os.Chmod(dir, 0o755); err != nil {
		t.Fatalf("seed chmod: %v", err)
	}

	nemonsDataDir()

	fi, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := fi.Mode().Perm(); got&0o077 != 0 {
		t.Errorf("existing data dir mode = %04o, want no group/other bits (0700)", got)
	}
}
