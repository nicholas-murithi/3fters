// Admin dashboard data: overview, analytics and CSV reports.
// Mounted at /api/admin/stats  (every route is admin-only, checked server-side).
const express = require('express');
const router  = express.Router();
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
  next();
}
router.use(protect, adminOnly);

// Orders that count as money received. (shipped is included: it comes after paid.)
const REVENUE_STATUSES = ['paid', 'shipped', 'delivered'];

// created_at is stored as UTC; group days the way you experience them in Nairobi.
const LOCAL = col => `((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')`;
const TODAY = `(NOW() AT TIME ZONE 'Africa/Nairobi')::date`;

const num = v => Number(v || 0);
const parseDays = q => Math.min(365, Math.max(1, parseInt(q, 10) || 7));
// % change vs the previous period. null = "no previous data to compare with"
const change = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? null : 0));

// Event counts (page_view etc). The events table may not exist yet, so never crash on it.
async function eventCounts(days) {
  try {
    const { rows } = await pool.query(
      `SELECT event_type,
              COUNT(*) FILTER (WHERE ${LOCAL('created_at')}::date >  ${TODAY} - $1::int)               AS cur,
              COUNT(*) FILTER (WHERE ${LOCAL('created_at')}::date <= ${TODAY} - $1::int
                                 AND ${LOCAL('created_at')}::date >  ${TODAY} - 2 * $1::int)           AS prev
       FROM events GROUP BY event_type`, [days]);
    const m = {};
    rows.forEach(r => { m[r.event_type] = { cur: num(r.cur), prev: num(r.prev) }; });
    return m;
  } catch (err) {
    return null;
  }
}

async function orderTotals(days) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status = ANY($2::text[]) AND d >  t.today - $1::int), 0) AS rev_cur,
       COALESCE(SUM(amount) FILTER (WHERE status = ANY($2::text[]) AND d <= t.today - $1::int AND d > t.today - 2 * $1::int), 0) AS rev_prev,
       COUNT(*) FILTER (WHERE d >  t.today - $1::int) AS ord_cur,
       COUNT(*) FILTER (WHERE d <= t.today - $1::int AND d > t.today - 2 * $1::int) AS ord_prev
     FROM (SELECT amount, status, ${LOCAL('created_at')}::date AS d FROM orders) o
     CROSS JOIN (SELECT ${TODAY} AS today) t`,
    [days, REVENUE_STATUSES]);
  const r = rows[0];
  return { revCur: num(r.rev_cur), revPrev: num(r.rev_prev), ordCur: num(r.ord_cur), ordPrev: num(r.ord_prev) };
}

async function dailySeries(days) {
  const { rows } = await pool.query(
    `SELECT to_char(g.d, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(o.amount) FILTER (WHERE o.status = ANY($2::text[])), 0) AS revenue,
            COUNT(o.id) AS orders
     FROM generate_series((${TODAY} - ($1::int - 1))::timestamp, ${TODAY}::timestamp, interval '1 day') AS g(d)
     LEFT JOIN orders o ON ${LOCAL('o.created_at')}::date = g.d::date
     GROUP BY g.d ORDER BY g.d`,
    [days, REVENUE_STATUSES]);
  return rows.map(r => ({ day: r.day, revenue: num(r.revenue), orders: num(r.orders) }));
}

// ---------- HOME ----------
router.get('/overview', async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const [ot, series, ev] = await Promise.all([orderTotals(days), dailySeries(days), eventCounts(days)]);

    const users = (await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE d >  t.today - $1::int) AS cur,
         COUNT(*) FILTER (WHERE d <= t.today - $1::int AND d > t.today - 2 * $1::int) AS prev,
         COUNT(*) AS total
       FROM (SELECT ${LOCAL('created_at')}::date AS d FROM users) u
       CROSS JOIN (SELECT ${TODAY} AS today) t`, [days])).rows[0];

    const pending = (await pool.query(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'`)).rows[0];

    const recent = (await pool.query(
      `SELECT o.id, o.amount, o.status, o.created_at, l.title, u.full_name AS buyer_name
       FROM orders o
       LEFT JOIN listings l ON l.id = o.listing_id
       LEFT JOIN users u    ON u.id = o.buyer_id
       ORDER BY o.created_at DESC LIMIT 8`)).rows;

    let conversion = null;
    if (ev) {
      const rate = (s, v) => (v > 0 ? Math.round((s / v) * 1000) / 10 : 0);
      const cur  = rate(ev.checkout_success?.cur || 0, ev.page_view?.cur || 0);
      const prev = rate(ev.checkout_success?.prev || 0, ev.page_view?.prev || 0);
      conversion = { value: cur, delta: Math.round((cur - prev) * 10) / 10 };
    }

    res.json({
      days,
      revenue: { value: ot.revCur,  change: change(ot.revCur, ot.revPrev) },
      orders:  { value: ot.ordCur,  change: change(ot.ordCur, ot.ordPrev) },
      users:   { value: num(users.cur), change: change(num(users.cur), num(users.prev)), total: num(users.total) },
      conversion,
      pendingOrders: num(pending.n),
      series,
      recentOrders: recent.map(r => ({ ...r, amount: num(r.amount) }))
    });
  } catch (err) {
    console.error('overview error:', err.message);
    res.status(500).json({ error: 'Could not load overview' });
  }
});

// ---------- ORDERS (with buyer phone + delivery address, for the WhatsApp flow) ----------
router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.amount, o.status, o.created_at, o.delivery_address,
              l.title, l.images[1] AS image,
              u.full_name AS buyer_name, u.phone AS buyer_phone, u.email AS buyer_email
       FROM orders o
       LEFT JOIN listings l ON l.id = o.listing_id
       LEFT JOIN users u    ON u.id = o.buyer_id
       ORDER BY o.created_at DESC LIMIT 500`);
    res.json(rows.map(r => ({ ...r, amount: num(r.amount) })));
  } catch (err) {
    console.error('orders error:', err.message);
    res.status(500).json({ error: 'Could not load orders' });
  }
});

// ---------- ANALYTICS ----------
router.get('/analytics', async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const [ot, series, ev] = await Promise.all([orderTotals(days), dailySeries(days), eventCounts(days)]);

    const byStatus = (await pool.query(
      `SELECT status, COUNT(*) AS n
       FROM orders WHERE ${LOCAL('created_at')}::date > ${TODAY} - $1::int
       GROUP BY status ORDER BY n DESC`, [days])).rows
      .map(r => ({ status: r.status, count: num(r.n) }));

    // Thrift items are one-of-a-kind, so "top products" is more useful by category.
    const categories = (await pool.query(
      `SELECT COALESCE(l.category, 'Uncategorised') AS category,
              COUNT(*) FILTER (WHERE o.d >  t.today - $1::int) AS units,
              COALESCE(SUM(o.amount) FILTER (WHERE o.d > t.today - $1::int), 0) AS revenue,
              COUNT(*) FILTER (WHERE o.d <= t.today - $1::int) AS prev_units
       FROM (SELECT listing_id, amount, status, ${LOCAL('created_at')}::date AS d FROM orders) o
       JOIN listings l ON l.id = o.listing_id
       CROSS JOIN (SELECT ${TODAY} AS today) t
       WHERE o.status = ANY($2::text[]) AND o.d > t.today - 2 * $1::int
       GROUP BY 1
       HAVING COUNT(*) FILTER (WHERE o.d > t.today - $1::int) > 0
       ORDER BY units DESC, revenue DESC LIMIT 8`,
      [days, REVENUE_STATUSES])).rows
      .map(r => ({ category: r.category, units: num(r.units), revenue: num(r.revenue), change: change(num(r.units), num(r.prev_units)) }));

    res.json({
      days,
      revenue: { value: ot.revCur, change: change(ot.revCur, ot.revPrev) },
      orders:  { value: ot.ordCur, change: change(ot.ordCur, ot.ordPrev) },
      views:   ev ? { value: ev.page_view?.cur || 0, change: change(ev.page_view?.cur || 0, ev.page_view?.prev || 0) } : null,
      series, byStatus, categories
    });
  } catch (err) {
    console.error('analytics error:', err.message);
    res.status(500).json({ error: 'Could not load analytics' });
  }
});

// ---------- REPORTS ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const stamp = col => `to_char(${LOCAL(col)}, 'YYYY-MM-DD HH24:MI')`;
const inRange = col => `${LOCAL(col)}::date BETWEEN $1::date AND $2::date`;

const REPORTS = {
  sales: {
    title: 'Sales report',
    build: () => ({
      sql: `SELECT ${stamp('o.created_at')} AS "Date", LEFT(o.id::text, 8) AS "Order", COALESCE(l.title, '-') AS "Item",
                   COALESCE(l.category, '-') AS "Category", o.amount::float AS "Amount (KSh)", o.status AS "Status"
            FROM orders o LEFT JOIN listings l ON l.id = o.listing_id
            WHERE ${inRange('o.created_at')} AND o.status = ANY($3::text[])
            ORDER BY o.created_at DESC LIMIT 10000`,
      extra: [REVENUE_STATUSES]
    })
  },
  orders: {
    title: 'Orders report',
    build: () => ({
      sql: `SELECT ${stamp('o.created_at')} AS "Date", LEFT(o.id::text, 8) AS "Order", COALESCE(l.title, '-') AS "Item",
                   COALESCE(u.full_name, '-') AS "Buyer", COALESCE(u.phone, '-') AS "Phone",
                   COALESCE(o.delivery_address, '-') AS "Delivery address", o.amount::float AS "Amount (KSh)", o.status AS "Status"
            FROM orders o LEFT JOIN listings l ON l.id = o.listing_id LEFT JOIN users u ON u.id = o.buyer_id
            WHERE ${inRange('o.created_at')}
            ORDER BY o.created_at DESC LIMIT 10000`,
      extra: []
    })
  },
  users: {
    title: 'User report',
    build: () => ({
      sql: `SELECT ${stamp('created_at')} AS "Joined", full_name AS "Name", email AS "Email", COALESCE(phone, '-') AS "Phone", role AS "Role"
            FROM users WHERE ${inRange('created_at')} ORDER BY created_at DESC LIMIT 10000`,
      extra: []
    })
  },
  listings: {
    title: 'Listings report',
    build: () => ({
      sql: `SELECT ${stamp('created_at')} AS "Added", title AS "Title", COALESCE(category, '-') AS "Category",
                   price::float AS "Price (KSh)", status AS "Status"
            FROM listings WHERE ${inRange('created_at')} ORDER BY created_at DESC LIMIT 10000`,
      extra: []
    })
  }
};

// Spreadsheet apps run text starting with = + - @ as a formula. Neutralise it.
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/report', async (req, res) => {
  const { type, from, to, format } = req.query;
  const def = REPORTS[type];
  if (!def) return res.status(400).json({ error: 'Unknown report type' });
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) return res.status(400).json({ error: 'Choose a valid From and To date' });
  if (from > to) return res.status(400).json({ error: '"From" must be before "To"' });
  if ((new Date(to) - new Date(from)) / 86400000 > 366) return res.status(400).json({ error: 'Please keep the range under one year' });

  try {
    const { sql, extra } = def.build();
    const { rows, fields } = await pool.query(sql, [from, to, ...extra]);
    const columns = fields.map(f => f.name);

    if (format === 'csv') {
      const lines = [columns.map(csvCell).join(',')].concat(rows.map(r => columns.map(c => csvCell(r[c])).join(',')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="3fters-${type}-${from}-to-${to}.csv"`);
      return res.send('\uFEFF' + lines.join('\r\n'));
    }

    const amountCol = columns.find(c => c.startsWith('Amount'));
    res.json({
      title: def.title, from, to, columns,
      total_rows: rows.length,
      total_amount: amountCol ? rows.reduce((s, r) => s + num(r[amountCol]), 0) : null,
      rows: rows.slice(0, 50)
    });
  } catch (err) {
    console.error('report error:', err.message);
    res.status(500).json({ error: 'Could not generate report' });
  }
});

module.exports = router;