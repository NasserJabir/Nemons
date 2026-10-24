const fs = require("fs").promises,
  path = require("path"),
  os = require("os");
const { nemonsHome } = require("./runtime-config");
const NEMONS_HOME = nemonsHome();
class MetricsCollector {
  async init() {
    await fs.mkdir(path.join(NEMONS_HOME, "metrics"), { recursive: true });
  }
  async recordRun(m) {
    await this.init();
    const id = "metric-" + Date.now().toString(36);
    const e = {
      id,
      timestamp: new Date().toISOString(),
      success: m.success || false,
      verification_passed: m.verification_passed || false,
      trust_delta: (m.trust_after || 1) - (m.trust_before || 1),
      experiences_reused: m.experiences_reused || 0,
      reuse_rate: m.experiences_reused > 0 ? 1 : 0,
      coverage_delta: (m.coverage_after || 0) - (m.coverage_before || 0),
      tokens_used: m.tokens_used || 0,
      cost_usd: m.cost_usd || 0,
      adapter: m.adapter || "unknown",
      harness: m.harness || "nemos",
    };
    await fs.writeFile(path.join(NEMONS_HOME, "metrics", id + ".json"), JSON.stringify(e, null, 2));
    return e;
  }
  async getAggregate() {
    await this.init();
    try {
      const f = await fs.readdir(path.join(NEMONS_HOME, "metrics"));
      const all = [];
      for (const fn of f)
        if (fn.endsWith(".json")) {
          try {
            all.push(JSON.parse(await fs.readFile(path.join(NEMONS_HOME, "metrics", fn), "utf8")));
          } catch {}
        }
      if (!all.length) return { total_runs: 0 };
      return {
        total_runs: all.length,
        success_rate: all.filter((e) => e.success).length / all.length,
        reuse_rate: all.filter((e) => e.reuse_rate > 0).length / all.length,
        avg_trust_delta: all.reduce((s, e) => s + e.trust_delta, 0) / all.length,
      };
    } catch {
      return { total_runs: 0 };
    }
  }
  async stats() {
    return { reference: "Evaluation: Metrics" };
  }
}
module.exports = { MetricsCollector };
