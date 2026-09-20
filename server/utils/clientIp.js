// Best-effort real visitor IP for rate limiting.
//
// Render sits behind Cloudflare, which OVERWRITES the CF-Connecting-IP header
// with the real visitor address (a visitor can't spoof it). We prefer that.
// X-Forwarded-For is NOT used directly: the visitor can put anything at the
// start of it. If the Cloudflare header is missing (local dev, or a hosting
// change) we fall back to Express's req.ip.
//
// To double-check on Render, set DEBUG_CLIENT_IP=1, send one chat message from
// your phone, and compare the logged `resolved` value with your public IP.
module.exports = function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  const resolved = (typeof cf === 'string' && cf.trim()) ? cf.trim() : req.ip;

  if (process.env.DEBUG_CLIENT_IP) {
    console.log('[clientIp]', {
      resolved,
      cf:    req.headers['cf-connecting-ip'],
      xff:   req.headers['x-forwarded-for'],
      reqIp: req.ip
    });
  }
  return resolved;
};