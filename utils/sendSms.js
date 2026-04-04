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

const sendApprovalSms = async (
  to,
  farmerName,
  productionCenterName,
  productionCenterAddress,
  contactPerson,
  approvedItems,
  rejectedItems,
  totalAmount
) => {
  try {
    if (!to) return;

    // Format items
    const approvedText = approvedItems.length
      ? approvedItems.map(i => `${i.name} (${i.qty})`).join(', ')
      : 'None';

    const rejectedText = rejectedItems.length
      ? rejectedItems.map(i => `${i.name}`).join(', ')
      : 'None';

    const message = `
🌱 TN Agroforestry

Dear ${farmerName || 'Farmer'},

Your request has been processed.

✅ Approved: ${approvedText}
❌ Rejected: ${rejectedText}

💰 Total Amount: ₹${totalAmount || 0}

📍 Collect from:
${productionCenterName}
${productionCenterAddress}

📞 Contact: ${contactPerson}

Please visit your account for full details.
`.trim();

    const sms = await client.messages.create({
      body: message,
      from:"+16164410732",
      to: "+918148614356", // ✅ use passed number
    });
    console.log(message , "message will be ")
    console.log("✅ Approval SMS sent:", sms.sid);
    return sms;

  } catch (error) {
    console.error("❌ Approval SMS error:", error.message);
  }
};

module.exports = { sendOtpSms , sendBillLinkSms , sendApprovalSms};
