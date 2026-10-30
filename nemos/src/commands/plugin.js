// ============================================================
// nemons plugin install|list|remove --agent <name>
// Installs Nemons plugin into a coding agent's directory
// v1.3.3 — Fixed: NO top-level await (CommonJS compatible)
// ============================================================
const path = require("path");
const os = require("os");
const fs = require("fs").promises;
const fsSync = require("fs");
const { resolvePort, resolveHost, nemonsHome } = require("../utils/runtime-config");

// Hosts that expose a real registration surface get a DRIVER: one module per
// host that knows where that host stores its config and how to read the host's
// own view back. Adding Qoder must not touch Codex, so the dispatch is a
// lookup instead of a second copy of the install flow.
const HOST_DRIVERS = {
  codex: () => require("../utils/codex-host"),
  qoder: () => require("../utils/qoder-host"),
};

function driverFor(conf) {
  const name = conf.driver || (conf.integration === "mcp" ? "codex" : null);
  if (!name || !HOST_DRIVERS[name]) return null;
  return HOST_DRIVERS[name]();
}

// Per-host wording + entry points, so one install flow serves both hosts
// without pretending they are the same shape.
const HOST_PROFILES = {
  codex: {
    name: "codex",
    homeLabel: "CODEX_HOME",
    entryLabel: (n) => `[mcp_servers.${n}]`,
    // Codex resolves the config itself and `codex mcp list` re-probes it, so
    // a read-back here is the host's own view.
    stateNote: "confirmed via codex mcp list --json",
    reloadNote: "MCP tools appear in Codex after a restart; verify with `codex mcp get nemons`.",
    adapt(mod) {
      return {
        ...mod,
        home: mod.codexHome,
        configPath: mod.codexConfigPath,
        detect: mod.detectCodex,
        hostDiagnosis: mod.hostDiagnosis,
      };
    },
  },
  qoder: {
    name: "qoder",
    homeLabel: "QODER_HOME",
    entryLabel: (n) => `mcpServers.${n}`,
    // There is no Qoder CLI: this can only ever mean "present in the file the
    // IDE reads". Saying "confirmed" here would be the exact claim the
    // honesty pass removed for the other six adapters.
    stateNote: "read back from the file the IDE reads — not a live connection",
    reloadNote: "Qoder IDE watches ~/.qoder/mcp.json but a write here does not prove it reloaded; in a session started before this write the tools are absent until the IDE reloads or the MCP server is reconnected in Settings.",
    adapt(mod) {
      return {
        ...mod,
        home: mod.qoderHome,
        configPath: mod.qoderConfigPath,
        detect: mod.detectQoder,
        readRuntimeDiscovery: mod.readRuntimeDiscovery,
      };
    },
  },
};

function hostProfileFor(conf) {
  const driver = driverFor(conf);
  if (!driver) return null;
  const profile = HOST_PROFILES[conf.driver || "codex"];
  return Object.assign({
    SERVER_NAME: driver.SERVER_NAME,
    TOKEN_ENV_VAR: driver.TOKEN_ENV_VAR,
    mcpUrl: driver.mcpUrl,
    daemonAuthEnabled: driver.daemonAuthEnabled,
    registerMcpServer: driver.registerMcpServer,
    removeMcpServer: driver.removeMcpServer,
    verifyRegistration: driver.verifyRegistration,
    installSkill: driver.installSkill,
    removeSkill: driver.removeSkill,
    skillInstalled: driver.skillInstalled,
  }, profile, profile.adapt(driver));
}

// ---------- Find project root (SYNCHRONOUS, no await) ----------
function findProjectRoot() {
  const candidates = [
    path.resolve(__dirname, "..", "..", ".."),  // nemons-project/ (3 levels up from src/commands/)
    path.resolve(__dirname, "..", ".."),         // nemons/ (fallback)
    path.resolve(__dirname, "..", "..", "..", ".."),
    process.cwd(),
  ];
  
  // Try each candidate
  for (const candidate of candidates) {
    try {
      if (fsSync.existsSync(path.join(candidate, "plugins"))) {
        return candidate;
      }
    } catch {}
  }
  
  // Search up to 10 parent directories
  let current = __dirname;
  for (let i = 0; i < 10; i++) {
    current = path.dirname(current);
    try {
      if (fsSync.existsSync(path.join(current, "plugins"))) {
        return current;
      }
    } catch {}
  }
  
  return path.resolve(__dirname, "..", "..", "..");  // best guess
}

// ---------- Find source file (ASYNC, but called from within functions) ----------
async function findSourceFile(candidates, projectRoot) {
  for (const candidate of candidates) {
    // Try as absolute path
    const fullPath = path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {}
    
    // Try relative to __dirname
    const relativePath = path.join(__dirname, candidate);
    try {
      await fs.access(relativePath);
      return relativePath;
    } catch {}
  }
  return null;
}

// ---------- Plugin configurations ----------
const SOURCE_FILES = {
  opencode: {
    name: "OpenCode",
    pluginDir: path.join(os.homedir(), ".config", "opencode", "plugins"),
    configFile: path.join(os.homedir(), ".config", "opencode", "opencode.json"),
    candidates: [
      "plugins/opencode/nemons.ts",
      "plugins/nemons-opencode.ts",
      "plugins/opencode/nemons.js",
    ],
    destName: "nemons.ts",
    configEntry: "./plugins/nemons",
  },
  
  "claude-code": {
    name: "Claude Code",
    pluginDir: path.join(os.homedir(), ".claude", "plugins", "nemons"),
    configFile: path.join(os.homedir(), ".claude", "settings.json"),
    candidates: [
      "plugins/claude-code/plugin.json",
      "plugins/nemons-claude-plugin.json",
    ],
    destName: "plugin.json",
    additionalFiles: [
      {
        candidates: [
          "config/skills/nemons-orchestrator.md",
          "skills/nemons-orchestrator.md",
        ],
        destName: "skills/nemons-orchestrator.md",
      }
    ],
  },
  
  // Codex does not use the file-copy path below. Measured against codex-cli
  // 0.149.1: ~/.codex/plugins/ is never read. Its channels are mcp_servers in
  // $CODEX_HOME/config.toml and $CODEX_HOME/skills/<name>/SKILL.md, and both
  // can be read back — so install reports what the host confirmed.
  codex: {
    name: "Codex CLI",
    integration: "mcp",
    pluginDir: path.join(os.homedir(), ".codex"),  // host-home marker for detection
    skillCandidates: ["config/skills/nemons-orchestrator.md", "skills/nemons-orchestrator.md"],
  },
  
  kimi: {
    name: "Kimi Code",
    pluginDir: path.join(os.homedir(), ".kimi", "plugins", "nemons"),
    candidates: ["plugins/kimi/nemons.js"],
    destName: "nemons.js",
    additionalFiles: [
      {
        candidates: ["config/skills/nemons-orchestrator.md", "skills/nemons-orchestrator.md"],
        destName: "skills/nemons-orchestrator.md",
      }
    ],
  },
  
  cline: {
    name: "Cline",
    pluginDir: path.join(os.homedir(), ".cline", "skills", "nemons"),
    candidates: ["plugins/cline/nemons.js"],
    destName: "nemons.js",
  },
  
  // Measured against Qoder IDE 1.37.0: it has NO plugin directory the IDE
  // reads, and the `qoder` binary on PATH is the IDE launcher, not a config
  // CLI. Its supported channel is the user-level mcpServers file at
  // ~/.qoder/mcp.json (+ ~/.qoder/skills/<name>/SKILL.md), so the driver
  // writes there and reads the file back — see src/utils/qoder-host.js.
  qoder: {
    name: "Qoder",
    integration: "mcp",
    driver: "qoder",
    pluginDir: path.join(os.homedir(), ".qoder"),  // host-home marker for detection
    skillCandidates: ["config/skills/nemons-orchestrator.md", "skills/nemons-orchestrator.md"],
    // We state the transport instead of leaving it to the IDE's auto-
    // detection, because our /mcp serves Streamable HTTP only (POST answers
    // JSON, GET is 405) and a wrong guess fails silently.
    mcpType: "streamable-http",
  },
  
  trae: {
    name: "Trae",
    pluginDir: path.join(os.homedir(), ".trae", "plugins", "nemons"),
    candidates: ["plugins/trae/manifest.json"],
    destName: "manifest.json",
  },
};

// ---------- Helpers ----------
async function copyFile(src, dest) {
  const content = await fs.readFile(src, "utf8");
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, content, "utf8");
}

function detectInstalledAgentsSync() {
  const found = [];
  const { execSync } = require("child_process");
  
  for (const [key, conf] of Object.entries(SOURCE_FILES)) {
    // Every name here is the host's own launcher/binary name, resolved on
    // PATH. `qodercli` was guessed: it is not installed and is not how the
    // Qoder IDE is invoked (the IDE ships `qoder` in its bin dir).
    const cmd = key === "claude-code" ? "claude" : key === "kimi" ? "kimi" : key;
    let isFound = false;
    
    try {
      execSync(`${process.platform === "win32" ? "where" : "command -v"} ${cmd}`, { stdio: "ignore" });
      isFound = true;
    } catch {}
    
    if (!isFound) {
      try {
        // mcp-integrated hosts have no plugin directory; their home marks them
        const probeDir = conf.integration === "mcp" ? conf.pluginDir : path.dirname(conf.pluginDir);
        if (fsSync.existsSync(probeDir)) {
          isFound = true;
        }
      } catch {}
    }
    
    if (isFound) {
      found.push(key);
    }
  }
  return found;
}

async function isAgentInstalled(conf) {
  try {
    await fs.access(conf.pluginDir);
    return true;
  } catch {
    return false;
  }
}

async function updateAgentConfig(configPath, pluginEntry) {
  let config = {};
  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = JSON.parse(raw);
  } catch {}
  
  config.plugins = config.plugins || [];
  if (!config.plugins.includes(pluginEntry)) {
    config.plugins.push(pluginEntry);
    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`  ✓ Updated config: ${configPath}`);
    } catch (err) {
      console.error(`  ⚠ Could not update config: ${err.message}`);
    }
  } else {
    console.log(`  ✓ Config already has plugin entry`);
  }
}

// ---------- Host-registered integrations (Codex, Qoder) ----------
// Everything below reports the HOST's own read-back. A zero exit code from
// `codex mcp add`, or a successful write to `~/.qoder/mcp.json`, is never
// treated as proof that the server is usable.
async function installViaHostRegistration(conf, projectRoot, opts, host) {
  const home = opts.home || host.home();
  const port = resolvePort({ explicit: opts.port });
  const listenHost = resolveHost();
  const url = host.mcpUrl(listenHost, port);
  const cli = host.detect();

  console.log(`  ${host.homeLabel}: ${home}`);
  console.log(`  Host app:   ${cli.available ? (cli.version ? `${cli.label || host.name} ${cli.version}` : cli.label || "detected") : "not detected"}`);
  console.log(`  MCP url:    ${url}`);

  // Ask the daemon whether it actually demands a token — never guess it.
  // Measured on Codex: registering a bearer var that is not set makes
  // `codex doctor` flag the MCP config on every run. On Qoder there is no
  // documented way to reference an environment variable from mcp.json, so a
  // token would have to be written as a literal secret; we refuse to do that
  // silently and say what the options are instead.
  const authEnabled = await host.daemonAuthEnabled({
    host: listenHost === "0.0.0.0" || listenHost === "::" ? "127.0.0.1" : listenHost,
    port,
  });
  let bearerTokenEnvVar;
  let headers;
  if (authEnabled === true && host.name === "codex") bearerTokenEnvVar = host.TOKEN_ENV_VAR;
  if (authEnabled === true && host.name === "qoder") {
    console.error("  ✗ The daemon demands a token, and Qoder's mcp.json has no documented way to");
    console.error("    reference an environment variable — the only alternative would be writing");
    console.error("    the secret in plaintext into a file the IDE reads.");
    console.error("    Either run the daemon open on loopback (unset NEMONS_AUTH_TOKEN) or add the");
    console.error("    header yourself in Qoder IDE Settings -> MCP after this run.");
    return false;
  }
  console.log(`  Auth:       ${authEnabled === true
    ? `daemon requires a token — wiring ${host.TOKEN_ENV_VAR} (set it wherever ${host.name} runs)`
    : authEnabled === false
      ? "daemon is open (NEMONS_AUTH_TOKEN unset) — no credential registered; re-run install if you enable auth"
      : "daemon not reachable at install time — registering without a credential"}`);

  const reg = await host.registerMcpServer({ home, url, bearerTokenEnvVar, headers, type: conf.mcpType });
  for (const attempt of reg.attempts) {
    console.log(`    · ${attempt.method}: ${attempt.ok ? "ok" : `✗ ${attempt.detail}`}`);
  }
  if (!reg.ok) {
    console.error(`  ✗ Registration NOT confirmed by read-back.`);
    console.error(`    Expected ${host.entryLabel(host.SERVER_NAME)} → ${url}`);
    console.error(`    Check: ${reg.configPath || host.configPath(home)}`);
    return false;
  }
  const back = reg.readback;
  console.log(`  ✓ Registered ${host.entryLabel(host.SERVER_NAME)} → ${back.url}`);
  console.log(`    transport=${back.transport} auth=${back.auth_status} (read back from ${back.via})`);
  if (back.otherServers && back.otherServers.length) {
    console.log(`    untouched alongside it: ${back.otherServers.join(", ")}`);
  }
  if (back.url_matches === false) {
    console.error(`  ✗ the url read back is not the one we wrote — aborting the claim, not the file`);
  }

  // Second channel: neither host offers a prompt hook, only skills it may
  // choose to load.
  const skillSrc = await findSourceFile(conf.skillCandidates, projectRoot);
  if (!skillSrc) {
    console.log(`  ⚠ Skill source not found — tried: ${conf.skillCandidates.join(", ")}`);
  } else {
    const sk = host.installSkill({ home, sourceFile: skillSrc, daemonHost: "127.0.0.1", daemonPort: port });
    console.log(sk.ok
      ? `  ✓ Skill written and re-read: ${sk.path}` +
        `${sk.rewrites ? ` (${sk.rewrites} endpoint reference(s) pointed at 127.0.0.1:${port})` : ""}`
      : `  ⚠ Skill NOT installed: ${sk.detail}`);
  }

  // Codex exposes a diagnostic that reads its own MCP config back; Qoder
  // exposes nothing to a CLI, so the closest equivalent is the tool cache
  // the IDE publishes for itself — which we only ever READ.
  if (host.name === "codex" && cli.available && !opts["no-doctor"]) {
    const dx = host.hostDiagnosis({ home });
    console.log(dx.available
      ? `  · codex doctor mcp.config: ${dx.status} — ${dx.summary}` +
        `${dx.configured ? ` (${dx.configured} configured${dx.transports.length ? ", " + dx.transports.join(", ") : ""})` : ""}`
      : `  ⚠ codex doctor unavailable: ${dx.detail}`);
    if (dx.available && dx.status !== "ok") {
      console.log(`    remediation: ${dx.remediation || "see \`codex doctor\`"}`);
    }
  }
  if (host.name === "qoder") {
    const rt = reg.runtime || host.readRuntimeDiscovery({});
    console.log(rt.discovered
      ? `  · IDE tool cache already lists "${host.SERVER_NAME}": ${rt.toolCount ?? rt.tools.length} tool(s), published ${rt.publishedAt}`
      : `  · IDE tool cache does NOT list "${host.SERVER_NAME}" yet (${rt.available ? "cache read, no entry" : rt.detail}) — that is expected: a written config is state 1, not a connection.`);
    console.log(`  ℹ Qoder has no CLI that reads its MCP config back. To see the host's own view:`);
    console.log(`    open Qoder IDE Settings → MCP 服务 and check the link icon / tool list for ${host.SERVER_NAME}.`);
  }

  console.log(`  ℹ ${host.reloadNote}`);
  if (host.name === "qoder") {
    console.log(`  ℹ Which state this run proved: "saved". "connected", "authenticated" and`);
    console.log(`    "tools available in this chat" are separate states the IDE does not report`);
    console.log(`    to a CLI — see the capability report before claiming any of them.`);
  }
  console.log(`  ℹ Skill discovery is decided by ${host.name} and was not verified here.`);
  return true;
}

async function describeHostRegistration(home, port, host) {
  const target = home || host.home();
  const url = host.mcpUrl(resolveHost(), resolvePort({ explicit: port }));
  const view = host.verifyRegistration({ home: target, expectedUrl: url });
  const skill = host.skillInstalled({ home: target });
  const notes = [`skill: ${skill.installed ? "present" : "absent"}`];

  if (!view.registered) {
    return { status: "✗ not registered", detail: `(no ${host.entryLabel(host.SERVER_NAME)} in ${view.source}${view.listError ? `; ${view.listError}` : ""})`, notes };
  }
  if (view.url_matches === false) {
    notes.unshift(`host has ${view.url}`);
    return { status: "⚠ registered elsewhere", detail: `(stale url ${view.url} — daemon is ${url}; re-run install)`, notes };
  }
  if (!view.enabled) {
    return { status: "⚠ registered (disabled)", detail: `(the host config marks it turned off)`, notes };
  }
  // Qoder: say explicitly which state we are attesting to. "registered" here
  // means "present in the file the IDE reads", nothing more.
  if (view.runtimeDiscovery) {
    notes.push(view.runtimeDiscovery.discovered
      ? `IDE cache: ${view.runtimeDiscovery.toolCount ?? view.runtimeDiscovery.tools.length} tool(s)`
      : "IDE cache: not loaded yet");
  }
  return {
    status: "✓ registered",
    detail: `(${view.url} · ${view.transport} · ${host.stateNote})`,
    notes,
  };
}

// ---------- Main command handler (NO top-level await) ----------
module.exports = async function (action, opts) {
  // Support both signatures
  if (typeof action === "object" && opts === undefined) {
    opts = action;
    action = opts.action || "install";
  }
  
  // Detect project root INSIDE the function (not at module level)
  const PROJECT_ROOT = findProjectRoot();
  
  const targetAgent = opts.agent || opts.a;
  
  switch (action) {
    case "install": {
      const found = detectInstalledAgentsSync();
      const targets = targetAgent ? [targetAgent] : found;
      
      if (targets.length === 0) {
        console.error("✗ No coding agents detected");
        console.error("  Install one of: opencode, claude, codex, kimi, qoder, cline");
        console.error("  Or specify manually: --agent <name>");
        console.error("  Available agent names:");
        Object.keys(SOURCE_FILES).forEach(k => console.error(`    - ${k}`));
        process.exit(1);
      }
      
      let installed = 0;
      let staged = 0;
      let failed = 0;
      
      for (const agent of targets) {
        const conf = SOURCE_FILES[agent];
        if (!conf) {
          console.error(`✗ Unknown agent: ${agent}`);
          console.error("  Available:", Object.keys(SOURCE_FILES).join(", "));
          failed++;
          continue;
        }
        
        console.log(`[nemons] Installing plugin for ${conf.name}...`);
        console.log(`  Project root: ${PROJECT_ROOT}`);
        
        // Hosts with a real registration surface go through the host, not a
        // file copy — a copied file proves nothing about the running agent.
        if (conf.integration === "mcp") {
          const host = hostProfileFor(conf);
          if (!host) {
            console.error(`  ✗ No host driver for "${agent}" (driver: ${conf.driver})`);
            failed++;
            continue;
          }
          if (await installViaHostRegistration(conf, PROJECT_ROOT, opts, host)) installed++;
          else failed++;
          continue;
        }
        
        // Find source file (async, but inside function)
        const sourcePath = await findSourceFile(conf.candidates, PROJECT_ROOT);
        if (!sourcePath) {
          console.error(`  ✗ Source file not found. Tried:`);
          for (const c of conf.candidates) {
            const full = path.isAbsolute(c) ? c : path.join(PROJECT_ROOT, c);
            console.error(`    - ${c} (resolved: ${full})`);
          }
          failed++;
          continue;
        }
        
        // Copy main plugin file
        const destPath = path.join(conf.pluginDir, conf.destName);
        try {
          await copyFile(sourcePath, destPath);
          console.log(`  ✓ Copied: ${conf.destName}`);
          console.log(`    From: ${sourcePath}`);
          console.log(`    To:   ${destPath}`);
        } catch (err) {
          console.error(`  ✗ Failed to copy ${conf.destName}: ${err.message}`);
          failed++;
          continue;
        }
        
        // Copy additional files
        if (conf.additionalFiles) {
          for (const additional of conf.additionalFiles) {
            const srcPath = await findSourceFile(additional.candidates, PROJECT_ROOT);
            if (srcPath) {
              const addDest = path.join(conf.pluginDir, additional.destName);
              try {
                await copyFile(srcPath, addDest);
                console.log(`  ✓ Copied: ${additional.destName}`);
              } catch (err) {
                console.error(`  ✗ Failed to copy ${additional.destName}: ${err.message}`);
              }
            } else {
              console.error(`  ⚠ Could not find source for ${additional.destName}`);
            }
          }
        }
        
        // Update agent config
        if (conf.configEntry && conf.configFile) {
          await updateAgentConfig(conf.configFile, conf.configEntry);
        }
        
        // Reference shims: the files are in place, but no host was asked to
        // accept them. Reporting that as "installed" is the claim this removes.
        console.log(`  ~ Files staged for ${conf.name} — the host was not asked to confirm them`);
        staged++;
      }
      
      console.log("");
      console.log("============================================================");
      console.log(`  Installation Summary`);
      console.log("============================================================");
      console.log(`  ✓ Host-confirmed registrations: ${installed}`);
      console.log(`  ~ Files staged, host not asked: ${staged}`);
      console.log(`  ✗ Failed:                   ${failed}`);
      console.log("");
      
      if (installed > 0) {
        console.log("  Next steps:");
        console.log("    1. Restart the host, then verify with: nemons plugin list");
        // Resolved, not hardcoded: NEMONS_PORT or config/daemon.yml can move
        // the daemon, and this line used to send people to the wrong port.
        console.log(`    2. Check dashboard: http://localhost:${resolvePort()}`);
        // Same reason for the log: NEMONS_HOME relocates the whole store, and
        // `tail -f` is not how you read it on Windows.
        console.log(`    3. Daemon log: ${path.join(nemonsHome(), "logs", "daemon.log")}`);
      }
      if (staged > 0) {
        console.log("  Note: staged adapters are unverified reference shims — see the");
        console.log("        README \"Integration status\" table before relying on one.");
      }
      // A command that registered nothing must not exit 0: the CLI dispatch
      // ignores the module's return value, so this is the only place the
      // status can be set. `nemons plugin install --agent qoder` used to
      // report "✗ Failed: 1" and leave the shell with exit code 0.
      if (installed === 0 && failed > 0) process.exitCode = 1;
      break;
    }
    
    case "list": {
      console.log("[nemons] Plugin status:");
      console.log("");
      const found = detectInstalledAgentsSync();
      
      for (const [agent, conf] of Object.entries(SOURCE_FILES)) {
        const isDetected = found.includes(agent);
        let status;
        let detail = "";

        if (conf.integration === "mcp") {
          // Ask the host, do not infer from our own files.
          const host = hostProfileFor(conf);
          if (!host) {
            status = "✗ no driver";
            detail = `(driver "${conf.driver}" is not implemented)`;
            console.log(`  ${conf.name.padEnd(15)} ${status} ${detail}`);
            continue;
          }
          const view = await describeHostRegistration(opts.home, opts.port, host);
          status = isDetected ? view.status : "  not detected";
          detail = isDetected ? `${view.detail} ${view.notes.join(" · ")}`.trim() : `(home ${opts.home || host.home()})`;
        } else {
          const isInstalled = await isAgentInstalled(conf);
          if (isInstalled) {
            // Files staged by us, NOT confirmed by the host — these adapters
            // are reference shims (see README "Integration status").
            status = "~ files staged";
            detail = `(at ${conf.pluginDir}; not host-verified)`;
          } else if (isDetected) {
            status = "⚠ detected";
            detail = "(not installed — run: nemons plugin install)";
          } else {
            status = "  not detected";
          }
        }

        console.log(`  ${conf.name.padEnd(15)} ${status} ${detail}`);
      }
      console.log("");
      console.log("  Legend: ✓ registered = host read-back confirms it · " +
        "~ files staged = copied, host never asked · ⚠ = needs attention");
      break;
    }
    
    case "remove": {
      if (!targetAgent) {
        console.error("✗ Specify --agent to remove");
        console.error("  Available:", Object.keys(SOURCE_FILES).join(", "));
        process.exit(1);
      }
      
      const conf = SOURCE_FILES[targetAgent];
      if (!conf) {
        console.error(`✗ Unknown agent: ${targetAgent}`);
        process.exit(1);
      }
      
      if (conf.integration === "mcp") {
        const host = hostProfileFor(conf);
        if (!host) {
          console.error(`✗ No host driver for "${targetAgent}" (driver: ${conf.driver})`);
          process.exit(1);
        }
        const home = opts.home || host.home();
        const gone = await host.removeMcpServer({ home });
        for (const note of gone.notes) console.log(`  · ${note}`);
        host.removeSkill({ home });
        if (!gone.ok) {
          console.error(`✗ ${conf.name} still lists the server (read-back said registered=${gone.stillRegistered})`);
          console.error(`  Inspect: ${host.configPath(home)}`);
          process.exit(1);
        }
        console.log(`✓ Nemons no longer registered for ${conf.name} (confirmed by re-reading ${host.configPath(home)})`);
        if (host.name === "qoder") {
          console.log("  Note: the IDE may keep the tools loaded in an already-running session;");
          console.log("        Qoder IDE Settings → MCP is the host's own view of what is live.");
        }
        break;
      }

      try {
        await fs.rm(conf.pluginDir, { recursive: true, force: true });
        console.log(`✓ Plugin files removed from ${conf.name}`);
        console.log(`  Removed: ${conf.pluginDir}`);
      } catch (err) {
        console.error(`✗ Failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }
    
    default:
      console.error(`Unknown action: ${action}. Use install|list|remove`);
      process.exit(1);
  }
};
