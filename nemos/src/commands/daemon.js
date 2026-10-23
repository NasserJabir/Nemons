// ============================================================
// nemons daemon start|stop|restart|status
// ============================================================
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs").promises;

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");
const PID_FILE = path.join(NEMONS_HOME, "run", "daemon.pid");

async function ensureDirs() {
  for (const dir of ["run", "logs", "config", "context-packs", "experiences", "evidence", "audit"]) {
    await fs.mkdir(path.join(NEMONS_HOME, dir), { recursive: true });
  }
}

async function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid() {
  try {
    const pid = await fs.readFile(PID_FILE, "utf8");
    return parseInt(pid.trim());
  } catch {
    return null;
  }
}

async function writePid(pid) {
  await fs.mkdir(path.dirname(PID_FILE), { recursive: true });
  await fs.writeFile(PID_FILE, String(pid));
}

async function clearPid() {
  try {
    await fs.unlink(PID_FILE);
  } catch {}
}

module.exports = async function (action, opts) {
  await ensureDirs();

  const configPath = (opts.config || "").replace("~", os.homedir());

  switch (action) {
    case "start": {
      const existing = await readPid();
      if (existing && (await isRunning(existing))) {
        console.log(`✓ Daemon already running (PID ${existing})`);
        return;
      }

      console.log("[nemons] Starting daemon...");
      const serverPath = path.join(__dirname, "..", "daemon", "server.js");

      const env = { ...process.env, NEMONS_HOME, NEMONS_CONFIG: configPath };
      if (opts.port) {
        env.NEMONS_PORT = opts.port;
      }

      const out = await fs.open(path.join(NEMONS_HOME, "logs", "daemon.log"), "a");
      const err = await fs.open(path.join(NEMONS_HOME, "logs", "daemon-error.log"), "a");

      const child = spawn(process.execPath, [serverPath], {
        env,
        stdio: ["ignore", out, err],
        detached: true,
      });

      await writePid(child.pid);
      child.unref();

      // Wait for health
      const port = opts.port || 3456;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          if (res.ok) {
            console.log(`✓ Daemon started (PID ${child.pid}) on port ${port}`);
            console.log(`  Dashboard: http://127.0.0.1:${port}`);
            return;
          }
        } catch {}
      }
      console.log(`⚠ Daemon started (PID ${child.pid}) but health check pending`);
      break;
    }

    case "stop": {
      const pid = await readPid();
      if (!pid) {
        console.log("✓ Daemon not running");
        return;
      }
      if (await isRunning(pid)) {
        process.kill(pid, "SIGTERM");
        console.log(`✓ Daemon stopped (PID ${pid})`);
      } else {
        console.log("✓ Daemon was not running (stale PID removed)");
      }
      await clearPid();
      break;
    }

    case "restart": {
      const pid = await readPid();
      if (pid && (await isRunning(pid))) {
        process.kill(pid, "SIGTERM");
        await new Promise((r) => setTimeout(r, 1000));
      }
      await clearPid();
      // Recurse to start
      return module.exports("start", opts);
    }

    case "status": {
      const pid = await readPid();
      if (pid && (await isRunning(pid))) {
        console.log(`✓ Daemon running (PID ${pid})`);
      } else {
        console.log("✗ Daemon not running");
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown action: ${action}. Use start|stop|restart|status`);
      process.exit(1);
  }
};
