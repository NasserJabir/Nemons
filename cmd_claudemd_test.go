package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/NasserJabir/Nemons/internal/claudemd"
	"github.com/NasserJabir/Nemons/internal/config"
	"github.com/NasserJabir/Nemons/internal/extraction"
	"github.com/NasserJabir/Nemons/internal/models"
	"github.com/NasserJabir/Nemons/internal/storage"
)

type claudeMdTestClient struct{ calls int }

func (c *claudeMdTestClient) Complete(system, user string, opts ...extraction.CallOption) (string, error) {
	c.calls++
	return "## Bekannte Fallen\n- test gotcha", nil
}

func (c *claudeMdTestClient) CompleteJSON(system, user string, schema map[string]any, opts ...extraction.CallOption) (string, error) {
	c.calls++
	return "{}", nil
}

func (c *claudeMdTestClient) Name() string  { return "test" }
func (c *claudeMdTestClient) Model() string { return "test-model" }

func TestClaudeMdOutputForOpencode(t *testing.T) {
	cfg := &config.ClaudeMdConfig{OutputFileName: "nemons-ops.md"}

	agents := claudeMdOutputFor(cfg, true)
	if !agents.agents {
		t.Error("--opencode must select the agents target")
	}
	if agents.fileName != "AGENTS.md" {
		t.Errorf("--opencode fileName = %q, want AGENTS.md", agents.fileName)
	}

	claude := claudeMdOutputFor(cfg, false)
	if claude.agents {
		t.Error("default mode must not select the agents target")
	}
	if claude.fileName != "nemons-ops.md" {
		t.Errorf("default mode fileName = %q, want nemons-ops.md", claude.fileName)
	}
}

// YM-56: the CLI had no path to GenerateAgentsMd. generateFor is the dispatch
// the CLI uses.
func TestGenerateForOpencodeWritesAgentsMd(t *testing.T) {
	store, err := storage.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	if _, err := store.InsertLearning(&models.Learning{
		SessionID:  "test-session",
		Category:   "gotcha",
		Content:    "test gotcha",
		Project:    "testproj",
		Confidence: 1.0,
		CreatedAt:  time.Now(),
		Source:     "llm_extracted",
	}); err != nil {
		t.Fatalf("seed learning: %v", err)
	}

	cfg := &config.ClaudeMdConfig{
		MaxPerCategory: map[string]int{"gotcha": 5},
		OutputFileName: "nemons-ops.md",
	}
	dir := t.TempDir()
	gen := claudemd.NewGenerator(store, &claudeMdTestClient{}, cfg)

	if err := generateFor(gen, "testproj", dir, claudeMdOutputFor(cfg, true)); err != nil {
		t.Fatalf("generateFor: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "AGENTS.md")); err != nil {
		t.Errorf("AGENTS.md not written: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".claude", "nemons-ops.md")); !os.IsNotExist(err) {
		t.Errorf("default target written in --opencode mode: %v", err)
	}
}
