package plugins

import "embed"

// BundledOpencodePluginV2 contains the v2 server plugin sources (opencode 2.x
// hook API, Plugin.define). Installed to
// ~/.config/opencode/plugins/opencode-nemons/, a directory opencode v2
// discovers on its own; configured file targets are dropped there.
//
//go:embed opencode-nemons-v2/*.ts
var BundledOpencodePluginV2 embed.FS

// WindowPlugin contains the v2 opencode TUI plugin that registers which
// session a terminal window shows (register_window), so spawned agents open
// on the caller's desktop. Installed to
// ~/.config/opencode/plugins/nemons-window/, where opencode auto-discovers
// and hot-reloads it into every running TUI.
//
//go:embed nemons-window/tui.tsx
var WindowPlugin embed.FS

// AgentThemes contains the opencode TUI theme family: one shared dark base with
// one accent per agent type (nemons-dark for the orchestrator, nemons-loop for
// yesloop, nemons-research for yesresearch, nemons-subresearch for its
// sub-agents). Installed to ~/.config/opencode/themes/ during setup, where
// opencode discovers theme files for every TUI.
//
//go:embed themes/*.json
var AgentThemes embed.FS
