// ============================================================
// Route-scoped rate limiting.
//
// The limiter previously ran as one global middleware keyed on the
// *concrete* request path. Two consequences, both real:
//   - `GET /context-pack/a` and `GET /context-pack/b` were separate
//     buckets, so varying a path parameter bypassed the limit
//     entirely (verified: 70/70 requests with distinct ids passed
//     while the same id tripped 429 after 60);
//   - every unique path created a permanent bucket, so a client
//     could grow the map without bound.
//
// This installer wraps the app's verb methods so the bucket is the
// registered ROUTE PATTERN (`GET /context-pack/:id`) instead. One
// route = one budget no matter which ids a client asks for, and
// the key space is bounded by the route table.
// ============================================================

const VERBS = ["get", "post", "put", "patch", "delete", "options", "head", "all"];

function clientIdOf(req) {
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Wrap `app.get/post/...` so every registration carries a limiter
 * guard bound to that route's pattern. Must run before the routes
 * are registered.
 */
function installRouteRateLimiter(app, limiter, exemptPaths = new Set()) {
  for (const verb of VERBS) {
    const original = app[verb];
    if (typeof original !== "function") continue;
    app[verb] = function (routePath, ...handlers) {
      // app.get("setting") is Express's own settings getter — not a route
      if (typeof routePath !== "string" || handlers.length === 0) {
        return original.call(this, routePath, ...handlers);
      }
      const bucket = `${verb.toUpperCase()} ${routePath}`;
      const guard = (req, res, next) => {
        if (exemptPaths.has(req.path)) return next();
        const verdict = limiter.check(bucket, clientIdOf(req));
        if (!verdict.allowed) {
          const retryAfter = Math.max(1, Math.ceil(((verdict.resetAt || Date.now()) - Date.now()) / 1000));
          res.set("Retry-After", String(retryAfter));
          return res.status(429).json({
            error: "rate_limited",
            // route pattern, never the concrete path: no id enumeration
            endpoint: bucket,
            limit: verdict.limit,
            retry_after_seconds: retryAfter,
          });
        }
        if (typeof verdict.remaining === "number") res.set("X-RateLimit-Remaining", String(verdict.remaining));
        next();
      };
      return original.call(this, routePath, guard, ...handlers);
    };
  }
}

module.exports = { installRouteRateLimiter, clientIdOf };
