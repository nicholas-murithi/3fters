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

