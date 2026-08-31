const express = require('express');
const router  = express.Router();
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');

// Admin only middleware
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
}

// GET all users
router.get('/users', protect, adminOnly, async (req, res) => {
  const result = await pool.query(
    'SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

// DELETE user
router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ message: 'User deleted' });
});

// PATCH change a user's role (e.g. convert legacy seller accounts to buyer)
router.patch('/users/:id/role', protect, adminOnly, async (req, res) => {
  const { role } = req.body;
  const allowedRoles = ['buyer', 'admin'];

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const result = await pool.query(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, email, phone, role, created_at',
    [role, req.params.id]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(result.rows[0]);
});

// PATCH bulk-convert every existing seller account to buyer
router.patch('/users/convert-sellers', protect, adminOnly, async (req, res) => {
  const result = await pool.query(
    `UPDATE users SET role = 'buyer' WHERE role = 'seller'
     RETURNING id, full_name, email, phone, role`
  );
  res.json({ message: `${result.rows.length} seller account(s) converted to buyer`, users: result.rows });
});

// GET all listings
router.get('/listings', protect, adminOnly, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM listings ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

// DELETE listing
router.delete('/listings/:id', protect, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM listings WHERE id = $1', [req.params.id]);
  res.json({ message: 'Listing deleted' });
});

// GET all orders
router.get('/orders', protect, adminOnly, async (req, res) => {
  const result = await pool.query(
    `SELECT o.*, l.title, u.full_name as buyer_name
     FROM orders o
     JOIN listings l ON o.listing_id = l.id
     JOIN users u ON o.buyer_id = u.id
     ORDER BY o.created_at DESC`
  );
  res.json(result.rows);
});

module.exports = router;