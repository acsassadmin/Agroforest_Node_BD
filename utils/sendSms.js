const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.warn('Twilio env vars missing — SMS disabled');
  module.exports = { sendSms: async () => null };
  return;
}
const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
module.exports = {
  sendSms: async (to, body) => twilio.messages.create({ from: TWILIO_PHONE_NUMBER, to, body })
};
