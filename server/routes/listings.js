const express = require('express');
const router  = express.Router();
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');

// Only 3FTERS admins can create/edit/remove listings — buyers can browse
// and purchase, but the catalog itself is managed centrally.
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
}

// GET all listings with filters
router.get('/', async (req, res) => {
  const { category, size, condition, search, min_price, max_price, sort, gender, style } = req.query;

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
  if (gender)    { query += ` AND l.gender = $${i++}`;                params.push(gender); }
  if (style)     { query += ` AND l.style = $${i++}`;                 params.push(style); }

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

// POST create listing (admin only)
router.post('/', protect, adminOnly, async (req, res) => {
  const { title, description, price, category, size, condition, images, gender, style, original_price } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'Title and price are required' });
  }

  // original_price only makes sense as a discount marker if it's actually
  // higher than the current price — otherwise ignore it.
  const cleanOriginalPrice =
    original_price && Number(original_price) > Number(price) ? original_price : null;

  try {
    const result = await pool.query(
      `INSERT INTO listings (seller_id, title, description, price, category, size, condition, images, gender, style, original_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [req.user.id, title, description, price, category, size, condition, images || [], gender || 'unisex', style || null, cleanOriginalPrice]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update listing (admin only)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  const { title, description, price, category, size, condition, status, gender, style, original_price } = req.body;

  const cleanOriginalPrice =
    original_price && Number(original_price) > Number(price) ? original_price : null;

  try {
    const result = await pool.query(
      `UPDATE listings
       SET title=$1, description=$2, price=$3, category=$4, size=$5, condition=$6, status=$7, gender=$8, style=$9, original_price=$10
       WHERE id=$11
       RETURNING *`,
      [title, description, price, category, size, condition, status, gender || 'unisex', style || null, cleanOriginalPrice, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE listing (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM listings WHERE id=$1', [req.params.id]);
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;