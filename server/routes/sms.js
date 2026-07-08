const AfricasTalking = require('africastalking');
require('dotenv').config({ path: __dirname + '/../.env' });

const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const sms = at.SMS;

async function sendSMS(to, message) {
  try {
    // Format phone for Kenya
    let phone = to.toString().trim();
    if (phone.startsWith('0')) phone = '+254' + phone.slice(1);
    if (phone.startsWith('254')) phone = '+' + phone;

    const result = await sms.send({
      to:      [phone],
      message: message,
      from:    '3FTERS'
    });

    console.log('SMS sent:', result);
    return result;
  } catch (err) {
    console.error('SMS error:', err);
  }
}

module.exports = { sendSMS };