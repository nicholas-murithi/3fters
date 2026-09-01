const express  = require('express');
const cors     = require('cors');
require('dotenv').config({ path: __dirname + '/.env' });

const authRoutes    = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const orderRoutes   = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const uploadRoutes  = require('./routes/upload');
const adminRoutes   = require('./routes/admin');
const reviewRoutes  = require('./routes/reviews');
const chatRoutes    = require('./routes/chat');

const app = express();

app.set('trust proxy', 1); // needed on Render so req.ip is the real visitor IP, not the proxy's
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth',     authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload',   uploadRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/chat',     chatRoutes);

app.get('/', (req, res) => {
  res.json({ message: '3FTERS API is running on Neon PostgreSQL' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`3FTERS server running on http://localhost:${PORT}`);
});

// Keep server awake on Render free tier
if (process.env.SERVER_URL) {
  setInterval(async () => {
    try {
      const https = require('https');
      https.get(`${process.env.SERVER_URL}/`);
      console.log('Keepalive ping sent');
    } catch (err) {
      console.error('Keepalive error:', err);
    }
  }, 10 * 60 * 1000); // ping every 10 minutes
}