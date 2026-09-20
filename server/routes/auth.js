const express        = require('express');
const router         = express.Router();
const bcrypt         = require('bcryptjs');
const crypto         = require('crypto');
const jwt            = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool           = require('../supabase/client');
const rateLimit      = require('../middleware/rateLimit');
require('dotenv').config({ path: __dirname + '/../.env' });

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Speed bumps against bulk fake signups and password guessing. Generous on
// purpose: campus / mobile-carrier networks put many real users behind one IP.
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20,
  message: 'Too many sign-ups from this network. Please try again later.' });
const loginLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 30,
  message: 'Too many login attempts. Please try again in a few minutes.' });

const isStr = v => typeof v === 'string';

// Generate a short, shareable referral code from the user's name + random suffix
function generateReferralCode(fullName) {
  const base = (fullName || 'FTER')
    .split(' ')[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5) || 'FTER';
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${base}${suffix}`;
}

// REGISTER
router.post('/register', registerLimiter, async (req, res) => {
  // NOTE: `role` from the request body is deliberately ignored. Everyone who
  // signs up is a buyer; admins are promoted from the admin panel / database.
  const { full_name, email, phone, password, referral_code } = req.body;

  if (!full_name || !email || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (![full_name, email, phone, password].every(isStr) ||
      (referral_code !== undefined && referral_code !== null && !isStr(referral_code))) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (full_name.length > 100 || email.length > 254 || phone.length > 20) {
    return res.status(400).json({ error: 'One of the fields is too long' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'Password must be 6–72 characters' });
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

    // If they entered a referral code, look up who it belongs to.
    // Invalid/unknown codes are silently ignored rather than blocking signup.
    let referredBy = null;
    if (referral_code) {
      const referrer = await pool.query(
        'SELECT id FROM users WHERE referral_code = $1', [referral_code.trim().toUpperCase()]
      );
      if (referrer.rows.length) referredBy = referrer.rows[0].id;
    }

    // Generate this new user's own referral code, retrying on the rare
    // collision since it's random.
    let myCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferralCode(full_name);
      const clash = await pool.query('SELECT id FROM users WHERE referral_code = $1', [candidate]);
      if (!clash.rows.length) { myCode = candidate; break; }
    }

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password, role, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, email, phone, role, referral_code`,
      [full_name.trim(), email, phone.trim(), hashed, 'buyer', myCode, referredBy]
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
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (!isStr(email) || !isStr(password)) {
    return res.status(400).json({ error: 'Invalid input' });
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

// GOOGLE SIGN-IN / SIGN-UP
router.post('/google', loginLimiter, async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Missing Google credential' });
  }

  try {
    // Verify the ID token with Google directly - never trust the client's claims.
    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }

    const { email, name, picture, email_verified } = payload;

    if (!email_verified) {
      return res.status(400).json({ error: 'Google email is not verified' });
    }

    // Find existing user by email, otherwise create one.
    let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (result.rows.length) {
      user = result.rows[0];

      // Password sign-ups never prove they own the email. If this account was
      // created that way, someone else (a pre-hijacker) may know its password.
      // Google has just proven the real owner of this address is signing in,
      // so: replace the password with an unusable one, wipe the name/phone
      // that was typed in at sign-up, and invalidate every token issued before
      // now. (`=== false` so this is skipped until the DB migration is run.)
      if (user.email_verified === false) {
        const lockedHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const upd = await pool.query(
          `UPDATE users
           SET password = $1, email_verified = true, sessions_valid_after = NOW(),
               full_name = $2, phone = '', avatar_url = COALESCE(avatar_url, $3)
           WHERE id = $4
           RETURNING *`,
          [lockedHash, name || email.split('@')[0], picture || null, user.id]
        );
        user = upd.rows[0];
      }
    } else {
      // Google users don't set a password or give a phone up front - fill in
      // a random, unusable password hash so existing NOT NULL columns are satisfied.
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashed          = await bcrypt.hash(randomPassword, 10);

      const insertResult = await pool.query(
        `INSERT INTO users (full_name, email, phone, password, role, avatar_url, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, full_name, email, phone, role, avatar_url`,
        [name || email.split('@')[0], email, '', hashed, 'buyer', picture || null]
      );
      user = insertResult.rows[0];
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
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Google sign-in failed' });
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

// GET current user's referral code + list of people they've referred
router.get('/referrals', require('../middleware/authMiddleware'), async (req, res) => {
  try {
    const me = await pool.query(
      'SELECT referral_code FROM users WHERE id = $1', [req.user.id]
    );
    if (!me.rows.length) return res.status(404).json({ error: 'User not found' });

    let myCode = me.rows[0].referral_code;

    // Users who signed up before this feature existed won't have a code yet
    // — generate one for them now instead of leaving it blank forever.
    if (!myCode) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateReferralCode(req.user.full_name);
        const clash = await pool.query('SELECT id FROM users WHERE referral_code = $1', [candidate]);
        if (!clash.rows.length) { myCode = candidate; break; }
      }
      await pool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [myCode, req.user.id]);
    }

    const referred = await pool.query(
      `SELECT full_name, created_at FROM users WHERE referred_by = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      referral_code: myCode,
      referred_count: referred.rows.length,
      referred_users: referred.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;