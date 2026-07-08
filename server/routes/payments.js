const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const pool    = require('../supabase/client');
const protect = require('../middleware/authMiddleware');
require('dotenv').config({ path: __dirname + '/../.env' });

async function getMpesaToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const res = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return res.data.access_token;
}

function getTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14);
}

// STK PUSH
router.post('/mpesa/stk-push', protect, async (req, res) => {
  const { phone, amount } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ error: 'Phone and amount required' });
  }

  let formattedPhone = phone.toString().trim();
  if (formattedPhone.startsWith('0'))  formattedPhone = '254' + formattedPhone.slice(1);
  if (formattedPhone.startsWith('+'))  formattedPhone = formattedPhone.slice(1);

  try {
    const token     = await getMpesaToken();
    const timestamp = getTimestamp();
    const password  = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            Math.ceil(Number(amount)),
        PartyA:            formattedPhone,
        PartyB:            process.env.MPESA_SHORTCODE,
        PhoneNumber:       formattedPhone,
        CallBackURL:       `${process.env.SERVER_URL}/api/payments/mpesa/callback`,
        AccountReference:  '3FTERS',
        TransactionDesc:   'Thrift purchase on 3FTERS'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({
      message:           'STK push sent',
      checkoutRequestId: response.data.CheckoutRequestID,
      data:              response.data
    });

  } catch (err) {
    console.error('M-Pesa error:', err.response?.data || err.message);
    res.status(500).json({
      error:   'M-Pesa payment failed',
      details: err.response?.data || err.message
    });
  }
});

// CALLBACK
router.post('/mpesa/callback', async (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  if (!callback) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  if (callback.ResultCode === 0) {
    const meta      = callback.CallbackMetadata?.Item || [];
    const mpesaCode = meta.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

    if (mpesaCode) {
      await pool.query(
        `UPDATE orders SET status='paid', mpesa_code=$1
         WHERE status='pending'`,
        [mpesaCode]
      );
    }
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// CHECK STATUS
router.post('/mpesa/check-status', protect, async (req, res) => {
  const { checkout_request_id } = req.body;

  try {
    const token     = await getMpesaToken();
    const timestamp = getTimestamp();
    const password  = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        CheckoutRequestID: checkout_request_id
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

module.exports = router;