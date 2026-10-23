// ============================================================
// nemons daemon start|stop|restart|status
//
// v4.2.1-fix: `stop` previously sent SIGTERM and immediately
// reported "stopped" without verifying the process actually died.
// This was a real correctness bug — on a CI runner, the next
// `daemon start` could hit EADDRINUSE because the previous process
// was still in TIME_WAIT or finishing in-flight requests.
//
// The new `stop`:
//   1. Sends SIGTERM
//   2. Polls isRunning(pid) every 100ms for up to 5 seconds
//   3. If still alive after SIGTERM, escalates to SIGKILL
//   4. Polls again for up to 3 seconds
//   5. Verifies the port is no longer responding (best-effort)
//   6. Reports "stopped" ONLY when the process is provably dead
//      and the PID file is removed
//   7. Exits non-zero if the process could not be killed
//      (so CI correctly fails the job instead of silently moving on)
// ============================================================
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs").promises;

const NEMONS_HOME = process.env.NEMONS_HOME || path.join(os.homedir(), ".nemons");
const PID_FILE = path.join(NEMONS_HOME, "run", "daemon.pid");
const DEFAULT_PORT = 3456;

// v4.2.1-fix: tuneable timeouts so CI can override them if needed
const SOFT_KILL_TIMEOUT_MS = parseInt(process.env.NEMONS_STOP_SOFT_TIMEOUT || "5000", 10);
const HARD_KILL_TIMEOUT_MS = parseInt(process.env.NEMONS_STOP_HARD_TIMEOUT || "3000", 10);
const POLL_INTERVAL_MS = 100;

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

// v4.2.1-fix: poll isRunning until it returns false or the deadline expires.
async function waitForDeath(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isRunning(pid))) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return !(await isRunning(pid));
}

// v4.2.1-fix: best-effort port check — returns true if the port
// is no longer accepting connections (i.e., the daemon has
// released its listener).
async function portIsFree(port) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    clearTimeout(timer);
    // If fetch succeeded, the port is still in use.
    return false;
  } catch {
    // Connection refused / aborted → port is free.
    return true;
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
      const port = parseInt(opts.port || process.env.NEMONS_PORT || DEFAULT_PORT, 10);
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
        console.log("✓ Daemon not running (no PID file)");
        return;
      }

      if (!(await isRunning(pid))) {
        console.log(`✓ Daemon was not running (stale PID ${pid} removed)`);
        await clearPid();
        return;
      }

      console.log(`[nemons] Sending SIGTERM to PID ${pid}...`);
      try {
        process.kill(pid, "SIGTERM");
      } catch (e) {
        // EPERM etc. — we can't kill it. Report failure honestly.
        console.error(`✗ Failed to send SIGTERM to PID ${pid}: ${e.message}`);
        process.exit(1);
      }

      // v4.2.1-fix: wait for the process to die from SIGTERM
      let died = await waitForDeath(pid, SOFT_KILL_TIMEOUT_MS);

      if (!died) {
        console.log(`[nemons] Process ${pid} did not die from SIGTERM within ${SOFT_KILL_TIMEOUT_MS}ms, escalating to SIGKILL...`);
        try {
          process.kill(pid, "SIGKILL");
        } catch (e) {
          console.error(`✗ Failed to send SIGKILL to PID ${pid}: ${e.message}`);
          process.exit(1);
        }
        died = await waitForDeath(pid, HARD_KILL_TIMEOUT_MS);
      }

      if (!died) {
        console.error(`✗ Process ${pid} did not die from SIGKILL within ${HARD_KILL_TIMEOUT_MS}ms — manual intervention required`);
        process.exit(1);
      }

      // v4.2.1-fix: best-effort verify the port is free too
      const port = parseInt(opts.port || process.env.NEMONS_PORT || DEFAULT_PORT, 10);
      const portFree = await portIsFree(port);
      if (!portFree) {
        console.warn(`⚠ Process ${pid} exited but port ${port} is still bound (TIME_WAIT or another daemon)`);
      }

      await clearPid();
      console.log(`✓ Daemon stopped (PID ${pid}) — verified dead, port ${port} ${portFree ? "free" : "still bound"}`);
      break;
    }

    case "restart": {
      const pid = await readPid();
      if (pid && (await isRunning(pid))) {
        process.kill(pid, "SIGTERM");
        // v4.2.1-fix: use the same waitForDeath as `stop`
        await waitForDeath(pid, SOFT_KILL_TIMEOUT_MS);
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
