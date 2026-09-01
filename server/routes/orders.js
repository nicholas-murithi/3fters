const express    = require('express');
const router     = express.Router();
const pool       = require('../supabase/client');
const protect    = require('../middleware/authMiddleware');
const { sendSMS } = require('./sms');

// POST create order
router.post('/', protect, async (req, res) => {
  const { listing_id, delivery_address } = req.body;

  try {
    // Get listing
    const listingRes = await pool.query(
      'SELECT * FROM listings WHERE id = $1', [listing_id]
    );

    if (!listingRes.rows.length) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = listingRes.rows[0];

    if (listing.status !== 'available') {
      return res.status(400).json({ error: 'Item is no longer available' });
    }

    // Create order
    const result = await pool.query(
      `INSERT INTO orders (buyer_id, seller_id, listing_id, amount, delivery_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, listing.seller_id, listing_id, listing.price, delivery_address]
    );

    // Mark listing as pending
    await pool.query(
      'UPDATE listings SET status=$1 WHERE id=$2',
      ['pending', listing_id]
    );

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
          `Hi ${seller.full_name}! You have a new order on 3FTERS for "${listing.title}" - KSh ${listing.price}. Log in to your dashboard to confirm.`
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
              l.title, l.images, l.price as listing_price,
              u.full_name as seller_name
       FROM orders o
       JOIN listings l ON o.listing_id = l.id
       JOIN users u ON o.seller_id = u.id
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

  const allowedStatuses = ['pending', 'paid', 'shipped', 'delivered'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Look up the order first to check ownership
    const existing = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);

    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = existing.rows[0];
    const isOwner = order.seller_id === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
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