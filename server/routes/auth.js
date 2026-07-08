const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../supabase/client');
require('dotenv').config({ path: __dirname + '/../.env' });

// REGISTER
router.post('/register', async (req, res) => {
  const { full_name, email, phone, password, role } = req.body;

  if (!full_name || !email || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if email exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1', [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, phone, role`,
      [full_name, email, phone, hashed, role || 'buyer']
    );

    const user  = result.rows[0];
    const token = jwt.sign(
      {
        id:        user.id,
        email:     user.email,
        role:      user.role,
        full_name: user.full_name,
        phone:     user.phone
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id:        user.id,
        full_name: user.full_name,
        email:     user.email,
        phone:     user.phone,
        role:      user.role
      }
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user  = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      {
        id:        user.id,
        email:     user.email,
        role:      user.role,
        full_name: user.full_name,
        phone:     user.phone
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id:        user.id,
        full_name: user.full_name,
        email:     user.email,
        phone:     user.phone,
        role:      user.role
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// GET current user
router.get('/me', require('../middleware/authMiddleware'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, phone, role, avatar_url, location FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;