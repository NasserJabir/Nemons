package models

import "testing"

func TestProjectMatches(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"", "", true},
		{"/home/user/myproject", "/home/user/myproject", true},
		{"/home/alice/myproject", "/home/bob/myproject", false},
		{"/home/user/foo", "/home/user/bar", false},
		{"myproject", "/home/user/myproject", false},
		{"", "/home/user/project", false},
	}
	for _, tt := range tests {
		got := ProjectMatches(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("ProjectMatches(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestCanonicalProject(t *testing.T) {
	tests := []struct {
		cwd  string
		want string
	}{
		{"/home/user/projects/nemons/.worktrees/opencode-proxy", "nemons"},
		{"/home/user/projects/nemons/.worktrees/feat+capability-memory", "nemons"},
		{"/home/user/projects/nemons", "nemons"},
		{"/home/user/projects/gluten", "gluten"},
		{"/var/www/html/GreenWashProjekt/greenWebsite", "greenWebsite"},
		{"/home/user/projects/.worktrees/my-feature", "projects"},
	}
	for _, tt := range tests {
		got := CanonicalProject(tt.cwd)
		if got != tt.want {
			t.Errorf("CanonicalProject(%q) = %q, want %q", tt.cwd, got, tt.want)
		}
	}
}
