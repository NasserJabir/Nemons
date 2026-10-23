// ============================================================
// nemons health
// ============================================================
module.exports = async function (opts) {
  const url = opts.url || "http://127.0.0.1:3456";
  const endpoint = opts.detailed ? "/health" : "/health";

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
