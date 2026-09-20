const express = require('express');
const router  = express.Router();
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Business hours: 9am–5pm, hourly slots, Mon–Sat
const SLOT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

// GET available slots for a given date (YYYY-MM-DD)
router.get('/availability', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

  const day = new Date(date + 'T00:00:00');
  if (day.getDay() === 0) {
    return res.json({ date, slots: [] }); // closed Sundays
  }

  try {
    const booked = await pool.query(
      `SELECT slot_time FROM bookings WHERE booking_date = $1 AND status != 'cancelled'`,
      [date]
    );
    const bookedHours = new Set(booked.rows.map(r => Number(r.slot_time.split(':')[0])));

    const slots = SLOT_HOURS
      .filter(h => !bookedHours.has(h))
      .map(h => `${String(h).padStart(2, '0')}:00`);

    res.json({ date, slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create a booking (logged-in users)
router.post('/', protect, async (req, res) => {
  const { booking_date, slot_time, notes, duration_hours } = req.body;

  if (!booking_date || !slot_time) {
    return res.status(400).json({ error: 'booking_date and slot_time are required' });
  }

  const hour = Number(slot_time.split(':')[0]);
  if (!SLOT_HOURS.includes(hour)) {
    return res.status(400).json({ error: 'Invalid time slot' });
  }

  try {
    // Atomic claim, same pattern as listing reservations: only succeeds if
    // nobody else has already booked this exact date+time.
    const clash = await pool.query(
      `SELECT id FROM bookings WHERE booking_date=$1 AND slot_time=$2 AND status != 'cancelled'`,
      [booking_date, slot_time]
    );
    if (clash.rows.length) {
      return res.status(409).json({ error: 'That slot was just booked by someone else.' });
    }

    const result = await pool.query(
      `INSERT INTO bookings (user_id, booking_date, slot_time, duration_hours, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [req.user.id, booking_date, slot_time, duration_hours || 1, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET my bookings
router.get('/my-bookings', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM bookings WHERE user_id = $1 ORDER BY booking_date DESC, slot_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH cancel own booking, or admin can set any status
router.patch('/:id/status', protect, async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  try {
    const existing = await pool.query('SELECT * FROM bookings WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Booking not found' });

    const booking = existing.rows[0];
    const isOwner = booking.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (status === 'cancelled' && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (status !== 'cancelled' && !isAdmin) {
      return res.status(403).json({ error: 'Only admin can set this status' });
    }

    const result = await pool.query(
      `UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all bookings (admin dashboard)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.full_name, u.phone
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE b.status != 'cancelled'
       ORDER BY b.booking_date ASC, b.slot_time ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;