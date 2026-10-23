// ============================================================
// nemons plugin install|list|remove --agent <name>
// Installs Nemons plugin into a coding agent's directory
// v1.3.3 — Fixed: NO top-level await (CommonJS compatible)
// ============================================================
const path = require("path");
const os = require("os");
const fs = require("fs").promises;
const fsSync = require("fs");

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
  
  codex: {
    name: "Codex CLI",
    pluginDir: path.join(os.homedir(), ".codex", "plugins", "nemons"),
    candidates: ["plugins/codex/nemons.js"],
    destName: "nemons.js",
    additionalFiles: [
      {
        candidates: ["config/skills/nemons-orchestrator.md", "skills/nemons-orchestrator.md"],
        destName: "skills/nemons-orchestrator.md",
      }
    ],
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
  
  qoder: {
    name: "Qoder",
    pluginDir: path.join(os.homedir(), ".qoder", "plugins", "nemons"),
    candidates: ["plugins/qoder/manifest.json"],
    destName: "manifest.json",
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
    const cmd = key === "claude-code" ? "claude" : key === "kimi" ? "kimi" : key === "qoder" ? "qodercli" : key;
    let isFound = false;
    
    try {
      execSync(`${process.platform === "win32" ? "where" : "command -v"} ${cmd}`, { stdio: "ignore" });
      isFound = true;
    } catch {}
    
    if (!isFound) {
      try {
        if (fsSync.existsSync(path.dirname(conf.pluginDir))) {
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
        
        console.log(`  ✓ Plugin installed for ${conf.name}`);
        installed++;
      }
      
      console.log("");
      console.log("============================================================");
      console.log(`  Installation Summary`);
      console.log("============================================================");
      console.log(`  ✓ Installed: ${installed}`);
      console.log(`  ✗ Failed:    ${failed}`);
      console.log("");
      
      if (installed > 0) {
        console.log("  Next steps:");
        console.log("    1. Restart your coding agent (if open)");
        console.log("    2. Run a test prompt: 'implement a hello world function'");
        console.log("    3. Check dashboard: http://localhost:3456");
        console.log("    4. Monitor logs: tail -f ~/.nemons/logs/daemon.log");
      }
      break;
    }
    
    case "list": {
      console.log("[nemons] Plugin status:");
      console.log("");
      const found = detectInstalledAgentsSync();
      
      for (const [agent, conf] of Object.entries(SOURCE_FILES)) {
        const isInstalled = await isAgentInstalled(conf);
        const isDetected = found.includes(agent);
        
        let status;
        let detail = "";
        if (isInstalled) {
          status = "✓ installed";
          detail = `(at ${conf.pluginDir})`;
        } else if (isDetected) {
          status = "⚠ detected";
          detail = "(not installed — run: nemons plugin install)";
        } else {
          status = "  not detected";
        }
        
        console.log(`  ${conf.name.padEnd(15)} ${status} ${detail}`);
      }
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
      
      try {
        await fs.rm(conf.pluginDir, { recursive: true, force: true });
        console.log(`✓ Plugin removed from ${conf.name}`);
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
