const Razorpay = require("razorpay");
const crypto = require("crypto");
require('dotenv').config()
// ✅ Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// * CREATE ORDER
async function createRazorpayOrder(amount, receiptId) {
 try {
  console.log("init razorpay");
  console.log("amount",amount);
  console.log(process.env.RAZORPAY_KEY_ID);
  console.log(process.env.RAZORPAY_KEY_SECRET);
  const options = {
    amount: Math.round(amount * 100), // Convert rupees to paise
    currency: "INR",
    receipt: receiptId,
    notes: {
      internal_order_id: receiptId // For tracking
    }
  };

  const order = await razorpay.orders.create(options);
  return order;
 } catch (error) {
  console.log("razorpay error",error);
 }
}

/**
 * VERIFY PAYMENT
 */
function verifyPayment({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  const isVerified = expectedSignature === razorpay_signature;
  
  if (!isVerified) {
    throw new Error("Payment signature verification failed");
  }
  
  return isVerified;
}

/**
 * FETCH PAYMENT DETAILS (Optional - for additional verification)
 */
async function fetchPaymentDetails(paymentId) {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error("Error fetching payment details:", error);
    throw error;
  }
}

module.exports = {
  razorpay, // Export instance if needed elsewhere
  createRazorpayOrder,
  verifyPayment,
  fetchPaymentDetails,
};