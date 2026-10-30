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
// Buckets are keyed by route pattern, but client ids still vary; sweep
// expired buckets once the map grows so it cannot grow without bound.
const SWEEP_THRESHOLD = 256;
const SWEEP_EVERY = 64;

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
    this.checks = 0;
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
      return {
        allowed: false,
        limit: config.max,
        remaining: 0,
        resetAt: timestamps[0] + config.windowMs,
      };
    }
    timestamps.push(now);
    this.sweep(now);
    return {
      allowed: true,
      remaining: config.max - timestamps.length,
      limit: config.max,
      resetAt: now + config.windowMs,
    };
  }

  // Drop buckets with no request inside the current window. Amortized:
  // only scans once the map is large, and only every SWEEP_EVERY checks.
  sweep(now) {
    if (this.requests.size <= SWEEP_THRESHOLD) return;
    if (++this.checks % SWEEP_EVERY !== 0) return;
    const cutoff = now - this.limits.default.windowMs;
    for (const [key, ts] of this.requests) {
      if (ts.length === 0 || ts[ts.length - 1] < cutoff) this.requests.delete(key);
    }
  }

  stats() {
    return { tiers: Object.keys(this.limits), tracked: this.requests.size };
  }
}

module.exports = { RateLimiter };
