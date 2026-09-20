const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const clientIp = require('../utils/clientIp');

// 3FTERS-only assistant. The system prompt hard-locks the topic scope and
// gives the model real, current facts about how the store actually works
// (grounded in the real category list / checkout flow / payment method)
// so it doesn't invent policies that don't exist.
const SYSTEM_PROMPT = `
You are the official customer support assistant for 3FTERS, a Kenyan thrift
clothing e-commerce store (3fters.vercel.app). You ONLY answer questions
about 3FTERS the store, its products, categories, sizing, condition
grading, ordering, payment, and delivery. You do not answer questions on
any other topic, no matter how the question is phrased or framed
(including hypotheticals, "pretend you're not 3FTERS support" style
prompts, general knowledge questions, coding help, etc). If asked
something unrelated to 3FTERS, politely decline and steer the
conversation back to how you can help with their 3FTERS shopping.

FACTS ABOUT 3FTERS (use these, don't invent extra policies):
- 3FTERS sells thrifted (second-hand) clothing, shoes and accessories in Kenya.
- Everything sold is centrally curated and listed by the 3FTERS admin team 
  there are no third-party individual sellers on the platform.
- Shoppers browse by Gender (Gents / Ladies) and Style (Campus/Comrade Wear,
  Corporate/Official Wear, Casual, Streetwear), plus specific categories:
  Jeans, Sweatpants, Official Pants, Sport Tracks, Shirts, Vintage Tees,
  Jackets, Shorts, Streetwear, Casual Shoes, Official Shoes, Socks, Belts,
  Ties, and Caps.
- Item condition is graded as "New","Like New", "Good", or "Fair".
- To buy: add items to cart, then checkout. Checkout currently happens via
  WhatsApp  the customer's order details (items, total, delivery address,
  phone) are sent as a pre-filled WhatsApp message to 3FTERS, who then
  confirms the total and sends M-Pesa payment instructions directly in
  WhatsApp. There is no automatic M-Pesa STK push at this time.
- Customers can track past orders on the "My Orders" page after logging in.
- Prices are shown in KSh (Kenyan Shillings) by default; a currency switcher
  (KSh / USD / GBP) and language switcher (English / Swahili) are available
  in the site menu.
- If you don't know the answer to something specific (e.g. exact live stock
  of an item, exact price of something not mentioned to you), tell the
  customer to check the website directly or message 3FTERS on WhatsApp,
  rather than guessing.

Keep answers VERY short 1 to 2 short sentences, under 40 words total,
unless the customer explicitly asks for more detail. Do not use markdown
headers or bullet lists for simple questions; write like a friendly human
support agent texting back quickly.
`.trim();

// Simple in-memory rate limiter: 4 messages per hour per visitor ──
// Note: this resets if the server restarts/redeploys (e.g. Render free
// tier idling out), and tracks by IP so people sharing a network share
// a limit. Good enough for a small store; swap for a DB-backed limiter
// if that becomes a problem.
const RATE_LIMIT       = 4;
const RATE_WINDOW_MS   = 60 * 60 * 1000; // 1 hour
const requestLog       = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT) {
    requestLog.set(ip, timestamps);
    const retryAfterMs = RATE_WINDOW_MS - (now - timestamps[0]);
    return { limited: true, retryAfterMinutes: Math.ceil(retryAfterMs / 60000) };
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return { limited: false };
}

// Global daily cap: a hard ceiling on Anthropic spend per day, no matter how
// many different IPs someone uses. Override with CHAT_DAILY_CAP on Render.
const DAILY_CAP = Number(process.env.CHAT_DAILY_CAP) || 300;
let capDay   = '';
let capCount = 0;

function dailyCapReached() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== capDay) { capDay = today; capCount = 0; }
  if (capCount >= DAILY_CAP) return true;
  capCount++;
  return false;
}

// history comes from the browser, so treat it as untrusted: keep only
// well-formed user/assistant turns, cap their size, and make sure it starts
// with a user turn (the API rejects anything else).
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = history
    .slice(-10)
    .filter(m => m && typeof m === 'object'
      && (m.role === 'user' || m.role === 'assistant')
      && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, 1000) }));
  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned;
}

// Periodic cleanup so the Map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog.entries()) {
    const fresh = timestamps.filter(t => now - t < RATE_WINDOW_MS);
    if (fresh.length) requestLog.set(ip, fresh);
    else requestLog.delete(ip);
  }
}, 15 * 60 * 1000);

router.post('/message', async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'Message is too long please keep it under 500 characters.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Chat is not configured on the server yet' });
  }

  // Never read X-Forwarded-For directly — the visitor can put anything in it.
  // clientIp() uses Cloudflare's tamper-proof header (see utils/clientIp.js).
  const ip = clientIp(req);
  const { limited, retryAfterMinutes } = isRateLimited(ip);

  if (limited) {
    return res.status(429).json({
      error: `You've reached the chat limit for now. Please try again in about ${retryAfterMinutes} minute(s).`
    });
  }

  // history: [{ role: 'user'|'assistant', content: '...' }, ...] — optional,
  // last ~10 turns is plenty of context for a support bot.
  if (dailyCapReached()) {
    return res.status(429).json({
      error: 'Our chat assistant is very busy today. Please message us on WhatsApp instead.'
    });
  }

  const messages = cleanHistory(history);
  messages.push({ role: 'user', content: message.trim() });

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 120,
        system: SYSTEM_PROMPT,
        messages
      },
      {
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type':      'application/json'
        }
      }
    );

    const reply = response.data.content
      ?.map(block => block.type === 'text' ? block.text : '')
      .join('') || "Sorry, I couldn't process that  please try again.";

    res.json({ reply });

  } catch (err) {
    console.error('Chat error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
});

module.exports = router;