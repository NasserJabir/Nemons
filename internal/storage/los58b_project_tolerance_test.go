package storage

import "testing"

// YM-424: the project filter has to tell the three states apart. A row without a path
// (a legacy bare name) has no handle but its name, so it stays discoverable under a
// request of the same basename. A row that names its repository by path is compared
// through its cluster key, so a worktree still belongs to its repository while a
// DIFFERENT repository with the same basename does not: live evidence is the
// installation's two "nemons" roots and four "cookie-consent-management" roots.
func TestLos58bProjectFilterSeparatesTheThreeStates(t *testing.T) {
	const repo = "/home/tester/memory/nemons"
	const worktree = repo + "/.worktrees/yesloop-los-58b"
	tests := []struct {
		name      string
		stored    string
		canonical string
		requested string
		want      bool
	}{
		{"unassigned row stays discoverable everywhere", "", "", repo, true},
		{"legacy row resolves by its basename", "nemons", "nemons", "/home/tester/projects/nemons", true},
		{"legacy row does not resolve to another name", "nemons", "nemons", "/home/tester/projects/other", false},
		{"path row matches its own project", repo, "nemons", repo, true},
		{"path row of another repo with the same basename", repo, "nemons", "/home/tester/projects/nemons", false},
		{"path row vs a bare-name request", repo, "nemons", "nemons", true},
		{"repository row is visible from its worktree", repo, "nemons", worktree, true},
		{"worktree row is visible from the repository", worktree, "nemons", repo, true},
	}
	for _, tt := range tests {
		if got := projectMatchesTolerant(tt.stored, tt.canonical, tt.requested); got != tt.want {
			t.Errorf("%s: projectMatchesTolerant(%q, %q, %q) = %v, want %v",
				tt.name, tt.stored, tt.canonical, tt.requested, got, tt.want)
		}
	}
}
