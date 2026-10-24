// ============================================================
// RateLimiter — fixed-window-per-endpoint request throttling.
// One instance is created at server boot and shared as express
// middleware; per-request instantiation would reset the counters
// and make the limiter a no-op.
//
// Tiers:
//   default — applied to every endpoint (NEMONS_RATE_MAX,
//             NEMONS_RATE_WINDOW_MS to override; used by tests).
//   strict  — reserved for expensive/sensitive endpoints
//             (a sixth of the default budget).
// ============================================================
class RateLimiter {
  constructor(options = {}) {
    const envInt = (name, fallback) => {
      const n = parseInt(process.env[name] || "", 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const windowMs = options.windowMs ?? envInt("NEMONS_RATE_WINDOW_MS", 60_000);
    const max = options.max ?? envInt("NEMONS_RATE_MAX", 60);
    this.limits = {
      default: { windowMs, max },
      strict: { windowMs, max: Math.max(1, Math.floor(max / 6)) },
    };
    this.requests = new Map(); // key: clientId:endpoint -> [timestamps]
  }

  check(endpoint, clientId) {
    clientId = clientId || "default";
    const key = clientId + ":" + endpoint;
    const config = this.limits.default;
    const now = Date.now();
    if (!this.requests.has(key)) this.requests.set(key, []);
    const timestamps = this.requests.get(key);
    while (timestamps.length > 0 && timestamps[0] < now - config.windowMs) {
      timestamps.shift();
    }
    if (timestamps.length >= config.max) {
      return { allowed: false, limit: config.max, remaining: 0 };
    }
    timestamps.push(now);
    return { allowed: true, remaining: config.max - timestamps.length, limit: config.max };
  }

  stats() {
    return { tiers: Object.keys(this.limits), tracked: this.requests.size };
  }
}

module.exports = { RateLimiter };
