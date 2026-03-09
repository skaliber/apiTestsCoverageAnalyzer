/**
 * rateLimit.js
 * Simple in-memory token bucket rate limiter middleware.
 * In production use express-rate-limit or Redis-backed solutions.
 */

/** Per-IP request windows: { ip -> { count, resetAt } } */
const windows = new Map();

/**
 * Creates a rate-limit middleware.
 * @param {object} options
 * @param {number} options.windowMs   - Window duration in ms (default: 60 000)
 * @param {number} options.max        - Max requests per window (default: 100)
 * @param {string} [options.keyBy]    - 'ip' (default) or 'user' (uses req.user.userId)
 */
function createRateLimiter({ windowMs = 60_000, max = 100, keyBy = 'ip' } = {}) {
  return (req, res, next) => {
    const key =
      keyBy === 'user' && req.user
        ? `user:${req.user.userId}`
        : `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;

    const now = Date.now();
    const entry = windows.get(key);

    if (!entry || now > entry.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(max - 1));
      return next();
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return res.status(429).json({
        error: 'TooManyRequests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    next();
  };
}

/** Default limiters for different endpoint tiers */
const standardLimit = createRateLimiter({ windowMs: 60_000, max: 100 });
const strictLimit   = createRateLimiter({ windowMs: 60_000, max: 20 });
const adminLimit    = createRateLimiter({ windowMs: 60_000, max: 200 });

/** Expose reset for test cleanup */
function resetAll() {
  windows.clear();
}

module.exports = { createRateLimiter, standardLimit, strictLimit, adminLimit, resetAll };
