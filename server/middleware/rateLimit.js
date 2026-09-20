const clientIp = require('../utils/clientIp');

// Tiny in-memory rate limiter (no extra dependency).
// Counters reset when the server restarts/redeploys, which is fine as a
// speed bump. `key` decides who is counted (default: client IP).
module.exports = function rateLimit({ windowMs, max, key, message }) {
  const keyFn = key || clientIp;
  const hits  = new Map(); // key -> [timestamps]

  // Periodic cleanup so the Map never grows forever
  setInterval(() => {
    const now = Date.now();
    for (const [k, stamps] of hits) {
      const fresh = stamps.filter(t => now - t < windowMs);
      if (fresh.length) hits.set(k, fresh);
      else hits.delete(k);
    }
  }, Math.min(windowMs, 10 * 60 * 1000)).unref();

  return (req, res, next) => {
    const k      = keyFn(req);
    const now    = Date.now();
    const stamps = (hits.get(k) || []).filter(t => now - t < windowMs);

    if (stamps.length >= max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - stamps[0])) / 1000)));
      return res.status(429).json({
        error: message || 'Too many requests. Please try again later.'
      });
    }

    stamps.push(now);
    hits.set(k, stamps);
    next();
  };
};