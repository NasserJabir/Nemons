package daemon

import (
	"strings"
	"testing"
)

// A bash job has no project of its own, and a cap that names one to the daemon
// cannot use a bare basename: the ambiguity check refuses it as soon as two
// projects share the name (live: "nemons" matched /home/tester/memory/nemons and
// /home/tester/projects/nemons, and the broadcast was rejected). The project is
// therefore recorded on the job and handed to the run as an absolute path.
func TestLos32cBashSandboxConfigExportsTheJobProject(t *testing.T) {
	isolateHome(t)
	h, _ := mustHandler(t)
	const project = "/home/tester/memory/nemons"
	job := &ScheduledJob{ID: "sched-los32c-proj", Name: "los32c-proj", Project: project}

	for _, profile := range []SandboxProfile{ProfileStandard, ProfileStrict} {
		got, ok := los32cEnvValue(h.bashSandboxConfig(job, nil, profile).Env, "NEMONS_PROJECT")
		if !ok {
			t.Fatalf("%s: no NEMONS_PROJECT, a cap cannot name its project", profile)
		}
		if got != project {
			t.Errorf("%s: NEMONS_PROJECT = %q, want the job's own project %q", profile, got, project)
		}
	}
}

// Without a recorded project nothing may be invented: jobWorkDir() would answer
// $HOME/projects/<basename>, a directory the daemon itself created and nobody
// reads. The variable is set EMPTY rather than omitted, so an inherited value is
// scrubbed by mergeEnv and the cap fails loudly.
func TestLos32cBashSandboxConfigDoesNotGuessTheProject(t *testing.T) {
	isolateHome(t)
	h, _ := mustHandler(t)
	t.Setenv("NEMONS_PROJECT", "/home/tester/projects/elsewhere")
	job := &ScheduledJob{ID: "sched-los32c-noproj", Name: "los32c-noproj"}

	if workDir := h.jobWorkDir(job); workDir == "" {
		t.Fatal("precondition: jobWorkDir must be set for this test to mean anything")
	}
	for _, profile := range []SandboxProfile{ProfileStandard, ProfileStrict} {
		got, ok := los32cEnvValue(h.bashSandboxConfig(job, nil, profile).Env, "NEMONS_PROJECT")
		if !ok {
			t.Fatalf("%s: the entry must be present (and empty) to scrub an inherited value", profile)
		}
		if got != "" {
			t.Errorf("%s: NEMONS_PROJECT = %q, want empty for a job without a project", profile, got)
		}
	}
}

// A relative value would reach the daemon as a short name and be refused as
// ambiguous, which is the failure this ticket is about.
func TestLos32cBashSandboxConfigSkipsARelativeProject(t *testing.T) {
	isolateHome(t)
	h, _ := mustHandler(t)
	job := &ScheduledJob{ID: "sched-los32c-rel", Name: "los32c-rel", Project: "nemons"}

	got, ok := los32cEnvValue(h.bashSandboxConfig(job, nil, ProfileStandard).Env, "NEMONS_PROJECT")
	if !ok || got != "" {
		t.Errorf("NEMONS_PROJECT = %q (present=%v), want empty: a relative project would be refused as ambiguous", got, ok)
	}
}

// The project is taken from the creating caller: the MCP layer always sends the
// working directory, so an agent-created job belongs to the project it was
// created from.
func TestLos32cScheduleCreateRecordsTheCallersProject(t *testing.T) {
	isolateHome(t)
	h, _ := mustHandler(t)
	h.scheduler = newScheduler(nil, nil)

	resp := h.handleSchedule(map[string]any{
		"action": "create", "name": "los32c-create", "cron": "*/5 * * * *",
		"mode": "bash", "cap_name": "proxy_health", "script_name": "proxy_health_bash",
		"_cwd": "/home/tester/memory/nemons",
	})
	if resp.Error != "" {
		t.Fatalf("create: %s", resp.Error)
	}

	job := los32cFindJob(t, h, "los32c-create")
	if job.Project != "/home/tester/memory/nemons" {
		t.Fatalf("project = %q, want the caller's directory", job.Project)
	}
}

// An explicit project wins over the directory the call came from.
func TestLos32cScheduleCreatePrefersAnExplicitProject(t *testing.T) {
	isolateHome(t)
	h, _ := mustHandler(t)
	h.scheduler = newScheduler(nil, nil)

	resp := h.handleSchedule(map[string]any{
		"action": "create", "name": "los32c-explicit", "cron": "*/5 * * * *",
		"mode": "bash", "cap_name": "proxy_health", "script_name": "proxy_health_bash",
		"project": "/home/tester/projects/nemons", "_cwd": "/home/tester/memory/nemons",
	})
	if resp.Error != "" {
		t.Fatalf("create: %s", resp.Error)
	}

	job := los32cFindJob(t, h, "los32c-explicit")
	if job.Project != "/home/tester/projects/nemons" {
		t.Fatalf("project = %q, want the explicit project", job.Project)
	}
}

// A relative project is dropped at creation, not stored: it would reach the
// daemon as a short name and be refused as ambiguous.
func TestLos32cScheduleCreateDropsARelativeProject(t *testing.T) {
	isolateHome(t)
	h, _ := mustHandler(t)
	h.scheduler = newScheduler(nil, nil)

	resp := h.handleSchedule(map[string]any{
		"action": "create", "name": "los32c-relative", "cron": "*/5 * * * *",
		"mode": "bash", "cap_name": "proxy_health", "script_name": "proxy_health_bash",
		"project": "nemons",
	})
	if resp.Error != "" {
		t.Fatalf("create: %s", resp.Error)
	}

	job := los32cFindJob(t, h, "los32c-relative")
	if job.Project != "" {
		t.Fatalf("project = %q, want it dropped", job.Project)
	}
}

func los32cFindJob(t *testing.T, h *Handler, name string) *ScheduledJob {
	t.Helper()
	for _, job := range h.scheduler.ListJobs() {
		if job.Name == name {
			found := job
			return &found
		}
	}
	t.Fatalf("job %q was not scheduled", name)
	return nil
}

// Los-spezifischer Name: parallele Loops teilen sich das Paket und legen
// ebenfalls Helfer an (siehe Kampagnenregeln, fakeDaemon/isSessionUUID).
func los32cEnvValue(env []string, key string) (string, bool) {
	for _, kv := range env {
		if name, value, _ := strings.Cut(kv, "="); name == key {
			return value, true
		}
	}
	return "", false
}
