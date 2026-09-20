const pool = require('../supabase/client');

// Unpaid 'pending' orders hold an item hostage. After PENDING_ORDER_TTL_HOURS
// (default 24) we cancel the order and put the item back on sale.
// Change the window with the PENDING_ORDER_TTL_HOURS env var on Render.
const TTL_HOURS = Number(process.env.PENDING_ORDER_TTL_HOURS) || 24;

async function expireStalePendingOrders() {
  try {
    const { rowCount } = await pool.query(
      `WITH expired AS (
         UPDATE orders SET status = 'cancelled'
         WHERE status = 'pending'
           AND created_at < NOW() - ($1 * INTERVAL '1 hour')
         RETURNING listing_id
       )
       UPDATE listings SET status = 'available'
       WHERE id IN (SELECT listing_id FROM expired) AND status = 'pending'`,
      [TTL_HOURS]
    );
    if (rowCount) console.log(`Released ${rowCount} listing(s) from expired pending orders`);
  } catch (err) {
    console.error('Expire pending orders error:', err.message);
  }
}

function start() {
  expireStalePendingOrders();
  setInterval(expireStalePendingOrders, 10 * 60 * 1000).unref();
}

module.exports = { start, expireStalePendingOrders };