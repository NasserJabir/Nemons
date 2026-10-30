// ============================================================
// nemons health [--detailed] [--url <base>]
// The CLI dispatches as cmd(subcommand, flags) and `health` has no
// subcommand, so the options arrive in the SECOND argument. With the old
// single-parameter signature `opts` was the subcommand — `undefined` for
// `nemons health` — and reading opts.url died. That broke the documented
// command and the root `npm run health`.
// ============================================================
const { resolvePort } = require("../utils/runtime-config");

module.exports = async function (subcommand, opts = {}) {
  // Resolved, not hardcoded: NEMONS_PORT and config/daemon.yml move the daemon,
  // and a check pinned to :3456 reports an unreachable daemon on any other port.
  const url = String(opts.url || `http://127.0.0.1:${resolvePort()}`).replace(/\/+$/, "");
  const endpoint = "/health";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}${endpoint}`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.error(`✗ Health check failed: HTTP ${res.status}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`✓ Daemon healthy on ${url}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Version: ${data.version}`);
    console.log(`  Uptime: ${Math.round(data.uptime || 0)}s`);

    if (opts.detailed) {
      console.log(`  Home: ${data.home}`);
      console.log(`  Config: ${data.config_loaded ? "loaded" : "default"}`);
      console.log(`  Timestamp: ${data.timestamp}`);
    }
  } catch (err) {
    console.error(`✗ Daemon unreachable: ${err.message}`);
    console.error(`  URL: ${url}`);
    console.error(`  Hint: Run 'nemons daemon start' first`);
    process.exit(1);
  }
};
