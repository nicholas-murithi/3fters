const express = require('express');
const router  = express.Router();
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');

// POST create a review (buyer reviews a delivered order)
router.post('/', protect, async (req, res) => {
  const { order_id, rating, comment } = req.body;

  if (!order_id || !rating) {
    return res.status(400).json({ error: 'order_id and rating are required' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  try {
    const orderRes = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2',
      [order_id, req.user.id]
    );

    if (!orderRes.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];

    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'You can only review delivered orders' });
    }

    const existing = await pool.query(
      'SELECT id FROM reviews WHERE order_id = $1', [order_id]
    );
    if (existing.rows.length) {
      return res.status(400).json({ error: 'You already reviewed this order' });
    }

    const result = await pool.query(
      `INSERT INTO reviews (order_id, listing_id, seller_id, buyer_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [order_id, order.listing_id, order.seller_id, req.user.id, rating, comment || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET reviews for a specific listing
router.get('/listing/:listingId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name as buyer_name
       FROM reviews r
       JOIN users u ON r.buyer_id = u.id
       WHERE r.listing_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.listingId]
    );

    const avgRes = await pool.query(
      'SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as total FROM reviews WHERE listing_id = $1',
      [req.params.listingId]
    );

    res.json({
      reviews: result.rows,
      avg_rating: avgRes.rows[0].avg_rating || 0,
      total: Number(avgRes.rows[0].total)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET overall 3FTERS store rating (all reviews from all buyers, site-wide)
router.get('/store', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name as buyer_name, l.title as listing_title
       FROM reviews r
       JOIN users u ON r.buyer_id = u.id
       JOIN listings l ON r.listing_id = l.id
       ORDER BY r.created_at DESC
       LIMIT 20`
    );

    const avgRes = await pool.query(
      'SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as total FROM reviews'
    );

    res.json({
      reviews: result.rows,
      avg_rating: avgRes.rows[0].avg_rating || 0,
      total: Number(avgRes.rows[0].total)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET check if the current user can review a given order (not yet reviewed + delivered)
router.get('/can-review/:orderId', protect, async (req, res) => {
  try {
    const orderRes = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2',
      [req.params.orderId, req.user.id]
    );
    if (!orderRes.rows.length) return res.json({ canReview: false });

    const order = orderRes.rows[0];
    if (order.status !== 'delivered') return res.json({ canReview: false });

    const existing = await pool.query(
      'SELECT id FROM reviews WHERE order_id = $1', [req.params.orderId]
    );

    res.json({ canReview: existing.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;