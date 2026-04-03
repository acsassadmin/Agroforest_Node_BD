const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendOtpSms = async (to, otp) => {
  console.log( process.env.TWILIO_FROM_NUMBER,"from number")
  try {
    const message = await client.messages.create({
      body: `Your OTP is: ${otp}`,
      from:"+16164410732",
      to: "+918148614356", // ✅ use passed number
    });

    console.log('SMS sent:', message.sid);
    return message;
  } catch (error) {
    console.error('SMS error:', error.message);
    throw error;
  }
};

const sendBillLinkSms = async (to, orderId, farmerName) => {
  try {
    const baseUrl = "https://192.168.1.39:3001";
    const billUrl = `${baseUrl}/users/generate-bill-pdf/?order_id=${orderId}`;
    
    const message = await client.messages.create({
      body: `Hi ${farmerName || 'Farmer'}, your bill for Order ${orderId} is ready. View here: ${billUrl}`,
      from:"+16164410732",
      to: "+918148614356", // ✅ use passed number
    });
    console.log('Bill SMS sent:', message.sid);
    return message;
  } catch (error) {
    console.error('Bill SMS error:', error.message);
    throw error;
  }
};


module.exports = { sendOtpSms , sendBillLinkSms};