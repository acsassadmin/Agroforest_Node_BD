const twilio = require('twilio');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
if (!accountSid || !authToken || !fromNumber) {
  throw new Error('Twilio env vars missing');
}
const client = twilio(accountSid, authToken);

const sendOtpSms = async (toPhone, otp) => {
  if (!toPhone) throw new Error('No phone number');
  const msg = await client.messages.create({
    body: `Your OTP for registration is: ${otp}. It is valid for 10 minutes.`,
    from: fromNumber,
    to: toPhone
  });
  return msg.sid;
};

module.exports = sendOtpSms;
