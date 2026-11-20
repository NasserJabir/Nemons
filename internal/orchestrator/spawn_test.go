package orchestrator

import (
	"runtime"
	"strings"
	"testing"
)

func TestBuildSpawnCommand_Ghostty(t *testing.T) {
	bin, args := BuildSpawnCommand("ghostty", "nemons agent", "")
	if bin != "ghostty" {
		t.Errorf("expected bin=ghostty, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
	if args[0] != "-e" {
		t.Errorf("ghostty spawn must use direct -e (works with and without single-instance; +new-window needs a running broker), got args[0]=%q", args[0])
	}
}

func TestBuildSpawnCommand_Kitty(t *testing.T) {
	bin, args := BuildSpawnCommand("kitty", "nemons agent", "")
	if bin != "kitty" {
		t.Errorf("expected bin=kitty, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
}

func TestBuildSpawnCommand_GnomeTerminal(t *testing.T) {
	bin, args := BuildSpawnCommand("gnome-terminal", "nemons agent", "")
	if bin != "gnome-terminal" {
		t.Errorf("expected bin=gnome-terminal, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
	// gnome-terminal uses --
	found := false
	for _, a := range args {
		if a == "--" {
			found = true
			break
		}
	}
	if !found {
		t.Error("gnome-terminal args must contain '--'")
	}
}

func TestBuildSpawnCommand_Alacritty(t *testing.T) {
	bin, args := BuildSpawnCommand("alacritty", "nemons agent", "")
	if bin != "alacritty" {
		t.Errorf("expected bin=alacritty, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
}

func TestBuildSpawnCommand_Wezterm(t *testing.T) {
	bin, args := BuildSpawnCommand("wezterm", "nemons agent", "")
	if bin != "wezterm" {
		t.Errorf("expected bin=wezterm, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
}

func TestBuildSpawnCommand_Xterm(t *testing.T) {
	bin, args := BuildSpawnCommand("xterm", "nemons agent", "")
	if bin != "xterm" {
		t.Errorf("expected bin=xterm, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
}

func TestBuildSpawnCommand_ITerm2(t *testing.T) {
	bin, args := BuildSpawnCommand("iTerm2", "nemons agent", "")
	if bin != "open" {
		t.Errorf("expected bin=open for iTerm2, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
}

func TestBuildSpawnCommand_Terminal(t *testing.T) {
	bin, args := BuildSpawnCommand("Terminal", "nemons agent", "")
	if bin != "open" {
		t.Errorf("expected bin=open for Terminal, got %q", bin)
	}
	if len(args) == 0 {
		t.Error("args must not be empty")
	}
}

func TestBuildSpawnCommand_Unknown(t *testing.T) {
	bin, args := BuildSpawnCommand("unknown", "nemons agent", "")
	if bin == "" {
		t.Error("bin must not be empty for unknown terminal")
	}
	if len(args) == 0 {
		t.Error("args must not be empty for unknown terminal")
	}
	if runtime.GOOS == "darwin" {
		if bin != "open" {
			t.Errorf("expected bin=open on macOS for unknown, got %q", bin)
		}
	} else {
		if bin != "x-terminal-emulator" {
			t.Errorf("expected bin=x-terminal-emulator on Linux for unknown, got %q", bin)
		}
	}
}

func TestBuildSpawnCommand_InnerCmdPresent(t *testing.T) {
	terminals := []string{"ghostty", "kitty", "gnome-terminal", "alacritty", "wezterm", "xterm"}
	innerCmd := "nemons"
	innerArgs := []string{"agent-tty", "--sock", "/tmp/test.sock"}
	for _, term := range terminals {
		t.Run(term, func(t *testing.T) {
			_, args := BuildSpawnCommand(term, innerCmd, "", innerArgs...)
			// Linux terminals wrap in bash -lc, so innerCmd is inside the shell string
			foundBash := false
			foundCmd := false
			for _, a := range args {
				if a == "bash" {
					foundBash = true
				}
				allParts := append([]string{innerCmd}, innerArgs...)
				if len(a) > 0 && (a == innerCmd || containsAll(a, allParts...)) {
					foundCmd = true
				}
			}
			if !foundBash {
				t.Errorf("BuildSpawnCommand(%q) args %v should contain 'bash'", term, args)
			}
			if !foundCmd {
				t.Errorf("BuildSpawnCommand(%q) args %v should contain innerCmd %q in shell string", term, args, innerCmd)
			}
		})
	}
}

func TestBuildShellCmd(t *testing.T) {
	got := buildShellCmd("/usr/bin/nemons", []string{"agent-tty", "--sock", "/tmp/s.sock"}, "")
	if got != ". ~/.bashrc 2>/dev/null; exec '/usr/bin/nemons' 'agent-tty' '--sock' '/tmp/s.sock'" {
		t.Errorf("unexpected shell cmd: %q", got)
	}
}

func TestBuildShellCmdWithTitle(t *testing.T) {
	got := buildShellCmd("/usr/bin/nemons", []string{"agent-tty"}, "nemons-test #5")
	want := ". ~/.bashrc 2>/dev/null; echo -ne '\\033]0;nemons-test #5\\007'; exec '/usr/bin/nemons' 'agent-tty'"
	if got != want {
		t.Errorf("buildShellCmd with title:\n  got:  %q\n  want: %q", got, want)
	}
}

func TestShellQuote(t *testing.T) {
	tests := []struct{ in, want string }{
		{"simple", "'simple'"},
		{"it's", "'it'\\''s'"},
		{"", "''"},
	}
	for _, tt := range tests {
		got := shellQuote(tt.in)
		if got != tt.want {
			t.Errorf("shellQuote(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestBuildSpawnCommandTmux(t *testing.T) {
	bin, args := BuildSpawnCommand("tmux", "/usr/local/bin/nemons", "Agent-0", "agent-tty", "--sock", "/tmp/nemons.sock")

	if bin != "sh" {
		t.Errorf("bin = %q, want %q", bin, "sh")
	}
	if len(args) != 2 || args[0] != "-c" {
		t.Errorf("args = %v, want [\"-c\", \"...\"]", args)
	}

	cmd := args[1] // the full sh -c argument
	for _, want := range []string{"tmux new-session", "nemons-agents", "tmux split-window", "-t nemons-agents", "select-layout"} {
		if !strings.Contains(cmd, want) {
			t.Errorf("tmux command missing %q:\n%s", want, cmd)
		}
	}
	// split-window must target the dedicated session, not only current window
	if strings.Contains(cmd, "split-window -d ") && !strings.Contains(cmd, "-t nemons-agents") {
		t.Error("split-window must target nemons-agents session")
	}
}

func TestBuildSpawnCommandTmuxContainsInnerCmd(t *testing.T) {
	bin, args := BuildSpawnCommand("tmux", "/usr/local/bin/nemons", "", "agent-tty", "--sock", "/tmp/test.sock")
	_ = bin
	cmd := args[1]
	if !strings.Contains(cmd, "nemons") {
		t.Errorf("tmux command does not contain inner binary: %s", cmd)
	}
	if !strings.Contains(cmd, "agent-tty") {
		t.Errorf("tmux command does not contain inner args: %s", cmd)
	}
}

func TestBuildSpawnCommandTmuxSessionIndependent(t *testing.T) {
	// Must work even when $TMUX is not set — spawning from ghostty or any terminal
	t.Setenv("TMUX", "")
	_, args := BuildSpawnCommand("tmux", "/usr/local/bin/nemons", "", "agent-tty", "--sock", "/tmp/test.sock")
	cmd := args[1]
	if !strings.Contains(cmd, "new-session") {
		t.Errorf("tmux command must ensure session exists via new-session: %s", cmd)
	}
	if !strings.Contains(cmd, "nemons-agents") {
		t.Errorf("tmux command must target dedicated nemons-agents session: %s", cmd)
	}
}

func TestBuildAttachCommand(t *testing.T) {
	t.Run("ghostty returns attach command", func(t *testing.T) {
		bin, args := BuildAttachCommand("ghostty", "nemons-agents")
		if bin != "ghostty" {
			t.Errorf("bin = %q, want %q", bin, "ghostty")
		}
		if len(args) < 2 || args[0] != "--fullscreen=true" || args[1] != "-e" {
			t.Errorf("BuildAttachCommand(ghostty): expected [--fullscreen=true -e ...], got %v", args)
		}
		joined := strings.Join(args, " ")
		for _, want := range []string{"tmux", "attach", "nemons-agents"} {
			if !strings.Contains(joined, want) {
				t.Errorf("BuildAttachCommand(ghostty) args missing %q: %v", want, args)
			}
		}
	})

	t.Run("gnome-terminal returns attach command", func(t *testing.T) {
		bin, args := BuildAttachCommand("gnome-terminal", "nemons-agents")
		if bin != "gnome-terminal" {
			t.Errorf("bin = %q, want %q", bin, "gnome-terminal")
		}
		joined := strings.Join(args, " ")
		for _, want := range []string{"tmux", "nemons-agents"} {
			if !strings.Contains(joined, want) {
				t.Errorf("BuildAttachCommand(gnome-terminal) args missing %q: %v", want, args)
			}
		}
	})

	t.Run("unknown terminal uses sh fallback", func(t *testing.T) {
		bin, args := BuildAttachCommand("unknown", "nemons-agents")
		if bin != "sh" {
			t.Errorf("bin = %q, want %q", bin, "sh")
		}
		joined := strings.Join(args, " ")
		for _, want := range []string{"tmux", "nemons-agents"} {
			if !strings.Contains(joined, want) {
				t.Errorf("BuildAttachCommand(unknown) args missing %q: %v", want, args)
			}
		}
	})
}

// containsAll checks if s contains all given substrings.
func containsAll(s string, subs ...string) bool {
	for _, sub := range subs {
		if !strings.Contains(s, sub) {
			return false
		}
	}
	return true
}
