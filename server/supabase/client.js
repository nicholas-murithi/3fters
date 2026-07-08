const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('❌ Neon DB connection error:', err.message);
  } else {
    console.log('✅ Connected to Neon PostgreSQL');
    done();
  }
});

module.exports = pool;

// Keep database awake — ping every 4 minutes
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('DB keepalive ping');
  } catch (err) {
    console.error('Keepalive error:', err);
  }
}, 4 * 60 * 1000);