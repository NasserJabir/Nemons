package models

import "testing"

// YM-273 (2): cluster keys were basenames, so two repositories sharing a name
// shared one cluster set. The cluster key identifies a repository by its root and
// resolves every worktree of it to that root.
func TestLos25b_ClusterProjectKeySeparatesSameBasenameRepos(t *testing.T) {
	cases := []struct {
		name    string
		project string
		want    string
	}{
		{"main repo", "/home/tester/memory/nemons", "/home/tester/memory/nemons"},
		{"worktree", "/home/tester/memory/nemons/.worktrees/yesloop-los-25b", "/home/tester/memory/nemons"},
		{"claude worktree", "/home/tester/other/.claude/worktrees/feature-x", "/home/tester/other"},
		{"trailing slash", "/home/tester/memory/nemons/", "/home/tester/memory/nemons"},
		{"same basename, other root", "/home/tester/archive/nemons", "/home/tester/archive/nemons"},
		// YM-424: a bare name names no repository, so it mints no key.
		{"legacy bare name", "nemons", ""},
		{"empty", "", ""},
	}

	seen := make(map[string]string, len(cases))
	for _, tc := range cases {
		got := ClusterProjectKey(tc.project)
		if got != tc.want {
			t.Fatalf("%s: ClusterProjectKey(%q) = %q, want %q", tc.name, tc.project, got, tc.want)
		}
		seen[got] = tc.project
	}

	if ClusterProjectKey("/home/tester/memory/nemons") == ClusterProjectKey("/home/tester/archive/nemons") {
		t.Fatal("two repositories with the same basename share one cluster key")
	}
}

// YM-273 (2): only an absolute path names a repository root. A bare name must not
// be mistaken for one, otherwise the caller would group it as its own repository.
func TestLos25b_RepositoryRootOnlyForPaths(t *testing.T) {
	cases := map[string]string{
		"/home/tester/memory/nemons":                            "/home/tester/memory/nemons",
		"/home/tester/memory/nemons/.worktrees/yesloop-los-25b": "/home/tester/memory/nemons",
		"/home/tester/other/.claude/worktrees/x/y":              "/home/tester/other",
		"nemons":          "",
		"":                "",
		"./relative/path": "",
	}
	for project, want := range cases {
		if got := RepositoryRoot(project); got != want {
			t.Fatalf("RepositoryRoot(%q) = %q, want %q", project, got, want)
		}
	}
}
