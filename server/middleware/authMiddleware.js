const jwt  = require('jsonwebtoken');
const pool = require('../supabase/client');
require('dotenv').config({ path: __dirname + '/../.env' });

// Verifies the JWT, then re-reads the user from the database so that:
//  - the role always comes from the DB, never from the token (a demoted or
//    tampered account loses admin power immediately, not after 7 days)
//  - deleted users are locked out straight away
//  - tokens issued before `sessions_valid_after` are rejected (used when an
//    account is recovered/taken over, see /auth/google)
module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token  please log in' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, full_name, phone, sessions_valid_after
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    const u = rows[0];

    if (!u) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }

    if (u.sessions_valid_after) {
      const validAfter = Math.floor(new Date(u.sessions_valid_after).getTime() / 1000);
      if (decoded.iat < validAfter) {
        return res.status(401).json({ error: 'Session expired  please log in again' });
      }
    }

    req.user = {
      id:        u.id,
      email:     u.email,
      role:      u.role,
      full_name: u.full_name,
      phone:     u.phone
    };
    next();
  } catch (err) {
    console.error('Auth check error:', err.message);
    res.status(500).json({ error: 'Could not verify your session' });
  }
};