const express = require('express');
const router  = express.Router();
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');

// GET all listings with filters
router.get('/', async (req, res) => {
  const { category, size, condition, search, min_price, max_price, sort } = req.query;

  let query  = `
    SELECT l.*, 
           u.full_name, u.avatar_url, u.location,
           COALESCE(r.avg_rating, 0) as avg_rating,
           COALESCE(r.review_count, 0) as review_count
    FROM listings l
    JOIN users u ON l.seller_id = u.id
    LEFT JOIN (
      SELECT listing_id, AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as review_count
      FROM reviews GROUP BY listing_id
    ) r ON r.listing_id = l.id
    WHERE l.status = 'available'
  `;
  const params = [];
  let i = 1;

  if (category)  { query += ` AND l.category = $${i++}`;              params.push(category); }
  if (size)      { query += ` AND l.size = $${i++}`;                  params.push(size); }
  if (condition) { query += ` AND l.condition = $${i++}`;             params.push(condition); }
  if (search)    { query += ` AND l.title ILIKE $${i++}`;             params.push(`%${search}%`); }
  if (min_price) { query += ` AND l.price >= $${i++}`;                params.push(min_price); }
  if (max_price) { query += ` AND l.price <= $${i++}`;                params.push(max_price); }

  const sortMap = {
    newest:      'l.created_at DESC',
    price_low:   'l.price ASC',
    price_high:  'l.price DESC',
    top_rated:   'avg_rating DESC NULLS LAST',
  };
  query += ` ORDER BY ${sortMap[sort] || sortMap.newest}`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single listing
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.full_name, u.avatar_url, u.location, u.phone
       FROM listings l
       JOIN users u ON l.seller_id = u.id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create listing
router.post('/', protect, async (req, res) => {
  const { title, description, price, category, size, condition, images } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'Title and price are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO listings (seller_id, title, description, price, category, size, condition, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.id, title, description, price, category, size, condition, images || []]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET seller's own listings
router.get('/seller/my-listings', protect, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM listings WHERE seller_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update listing
router.patch('/:id', protect, async (req, res) => {
  const { title, description, price, category, size, condition, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE listings
       SET title=$1, description=$2, price=$3, category=$4, size=$5, condition=$6, status=$7
       WHERE id=$8 AND seller_id=$9
       RETURNING *`,
      [title, description, price, category, size, condition, status, req.params.id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Listing not found or not yours' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE listing
router.delete('/:id', protect, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM listings WHERE id=$1 AND seller_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;