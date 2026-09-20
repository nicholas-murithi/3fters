const express    = require('express');
const router     = express.Router();
const pool       = require('../supabase/client');
const protect    = require('../middleware/authMiddleware');
const { sendSMS } = require('./sms');
const rateLimit  = require('../middleware/rateLimit');

// Stops one account from reserving the whole catalogue (each order flips an
// item to 'pending' and sends you an SMS). Unpaid orders also expire on their
// own — see server/jobs/expirePendingOrders.js.
const MAX_PENDING_PER_USER = Number(process.env.MAX_PENDING_ORDERS_PER_USER) || 10;
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      30,
  key:      req => 'user:' + req.user.id,
  message:  'You are placing orders too quickly. Please try again later.'
});

// POST create order
router.post('/', protect, orderLimiter, async (req, res) => {
  const { listing_id, delivery_address } = req.body;

  if (!listing_id || (typeof listing_id !== 'string' && typeof listing_id !== 'number')) {
    return res.status(400).json({ error: 'listing_id is required' });
  }
  if (typeof delivery_address !== 'string' || !delivery_address.trim() || delivery_address.length > 300) {
    return res.status(400).json({ error: 'A delivery address (under 300 characters) is required' });
  }

  try {
    // Cap how many unpaid orders one account can hold at a time
    const open = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE buyer_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    if (open.rows[0].n >= MAX_PENDING_PER_USER) {
      return res.status(429).json({
        error: 'You have too many unpaid orders. Please complete or cancel some before ordering more.'
      });
    }

    // Get listing (for price/seller info)
    const listingRes = await pool.query(
      'SELECT * FROM listings WHERE id = $1', [listing_id]
    );

    if (!listingRes.rows.length) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = listingRes.rows[0];

    // Atomically claim the listing: this UPDATE only succeeds if the
    // listing is STILL 'available' at the moment it runs. If two buyers
    // hit this at the same time, the database guarantees only one of
    // these UPDATEs can flip the row from 'available' -> 'pending' —
    // the second one affects 0 rows, so we know someone beat them to it.
    const claim = await pool.query(
      `UPDATE listings SET status='pending'
       WHERE id=$1 AND status='available'
       RETURNING *`,
      [listing_id]
    );

    if (!claim.rows.length) {
      return res.status(409).json({ error: 'Sorry, this item was just sold to someone else.' });
    }

    // Create order
    let result;
    try {
      result = await pool.query(
        `INSERT INTO orders (buyer_id, seller_id, listing_id, amount, delivery_address)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.user.id, listing.seller_id, listing_id, listing.price, delivery_address.trim()]
      );
    } catch (insertErr) {
      // Order creation failed after we'd already claimed the listing —
      // release it back to 'available' so it isn't stuck in limbo.
      await pool.query(
        `UPDATE listings SET status='available' WHERE id=$1 AND status='pending'`,
        [listing_id]
      );
      throw insertErr;
    }

    res.status(201).json(result.rows[0]);

    // Notify seller via SMS
    try {
      const sellerRes = await pool.query(
        'SELECT full_name, phone FROM users WHERE id = $1',
        [listing.seller_id]
      );
      const seller = sellerRes.rows[0];
      if (seller?.phone) {
        await sendSMS(
          seller.phone,
          `Hi ${seller.full_name}! You have a new order on 3FTERS for "${listing.title}"  KSh ${listing.price}. Log in to your dashboard to confirm.`
        );
      }
    } catch (smsErr) {
      console.error('SMS notification error:', smsErr);
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET buyer's orders
router.get('/my-orders', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
              l.title, l.images, l.price as listing_price
       FROM orders o
       JOIN listings l ON o.listing_id = l.id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET seller's orders
router.get('/seller-orders', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*,
              l.title, l.images,
              u.full_name as buyer_name, u.phone as buyer_phone
       FROM orders o
       JOIN listings l ON o.listing_id = l.id
       JOIN users u ON o.buyer_id = u.id
       WHERE o.seller_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update order status
router.patch('/:id/status', protect, async (req, res) => {
  const { status } = req.body;

  const allowedStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Look up the order first to check ownership
    const existing = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);

    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order    = existing.rows[0];
    const isOwner  = order.seller_id === req.user.id; // seller (3FTERS admin/staff)
    const isBuyer  = order.buyer_id  === req.user.id;
    const isAdmin  = req.user.role   === 'admin';

    // Buyers can only cancel their OWN order, and only while it's still
    // 'pending' (i.e. before we've shipped or confirmed payment). Anything
    // else (marking paid/shipped/delivered) stays seller/admin only.
    if (status === 'cancelled') {
      if (!isBuyer && !isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized to cancel this order' });
      }
      if (isBuyer && !isOwner && !isAdmin && order.status !== 'pending') {
        return res.status(400).json({ error: 'This order can no longer be cancelled it has already been confirmed. Please contact us on WhatsApp.' });
      }
    } else if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this order' });
    }

    const result = await pool.query(
      `UPDATE orders SET status=$1 WHERE id=$2
       RETURNING *`,
      [status, req.params.id]
    );

    // If delivered mark listing as sold
    if (status === 'delivered') {
      await pool.query(
        'UPDATE listings SET status=$1 WHERE id=$2',
        ['sold', result.rows[0].listing_id]
      );
    }

    // If cancelled, release the listing back to 'available' so someone
    // else can buy it — but only if it's still 'pending' (don't un-sell
    // something that was already marked sold via a different flow).
    if (status === 'cancelled') {
      await pool.query(
        `UPDATE listings SET status='available' WHERE id=$1 AND status='pending'`,
        [result.rows[0].listing_id]
      );
    }

    // Notify buyer when order is shipped
    if (status === 'shipped') {
      try {
        const buyerRes = await pool.query(
          'SELECT full_name, phone FROM users WHERE id = $1',
          [result.rows[0].buyer_id]
        );
        const buyer = buyerRes.rows[0];
        if (buyer?.phone) {
          await sendSMS(
            buyer.phone,
            `Hi ${buyer.full_name}! Your 3FTERS order has been shipped and is on its way to you. Track it on your orders page.`
          );
        }
      } catch (smsErr) {
        console.error('SMS notification error:', smsErr);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;