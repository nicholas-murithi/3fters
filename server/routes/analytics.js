const express = require('express');
const router  = express.Router();
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// POST log an event — no auth required, fired from any page
router.post('/track', async (req, res) => {
  const { event_type, listing_id } = req.body;
  const allowed = ['page_view', 'add_to_cart', 'checkout_start', 'checkout_success'];
  if (!allowed.includes(event_type)) return res.status(400).json({ error: 'Invalid event type' });

  try {
    await pool.query(
      `INSERT INTO events (event_type, listing_id) VALUES ($1, $2)`,
      [event_type, listing_id || null]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET summary for admin dashboard
router.get('/summary', protect, adminOnly, async (req, res) => {
  try {
    const counts = await pool.query(`
      SELECT event_type, COUNT(*) as count
      FROM events
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY event_type
    `);
    const byDay = await pool.query(`
      SELECT DATE(created_at) as day, event_type, COUNT(*) as count
      FROM events
      WHERE created_at > NOW() - INTERVAL '14 days'
      GROUP BY day, event_type
      ORDER BY day DESC
    `);
    res.json({ totals: counts.rows, daily: byDay.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;