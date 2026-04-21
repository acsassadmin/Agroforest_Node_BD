const express = require("express");
const router = express.Router();
const { createRazorpayOrder, verifyPayment, fetchPaymentDetails } = require("../Razorpay/razorpay");

/**
 * POST /payment/create-order
 * Create a Razorpay order
 */
router.post("/create-order", async (req, res) => {
  try {
    const { amount, order_id } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid amount" 
      });
    }

    if (!order_id) {
      return res.status(400).json({ 
        success: false, 
        error: "Order ID is required" 
      });
    }

    // Create a unique receipt ID using order_id and timestamp
    const receiptId = `rcpt_${order_id}_${Date.now()}`;

    // Create Razorpay order
    const order = await createRazorpayOrder(amount, receiptId);

    res.json({                               
      success: true, 
      key_id: process.env.RAZORPAY_KEY_ID, // Send key to frontend
      amount: order.amount,
      currency: order.currency,
      razorpay_order_id: order.id,
      receipt: order.receipt,
    });


  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message || "Failed to create order" 
    });
  }
});

/**
 * POST /api/payment/verify-payment
 * Verify Razorpay payment signature
 */
router.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
    } = req.body;

    // Check all required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Missing payment verification fields",
      });
    }

    // Verify signature
    const isVerified = verifyPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (isVerified) {
      // Optionally fetch payment details for additional verification
      let paymentDetails = null;
      try {
        paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
      } catch (fetchErr) {
        console.warn("Could not fetch payment details:", fetchErr.message);
      }

      res.json({
        success: true,
        message: "Payment verified successfully",
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        // Include payment details if fetched
        ...(paymentDetails && {
          payment_amount: paymentDetails.amount,
          payment_status: paymentDetails.status,
          payment_method: paymentDetails.method,
          captured: paymentDetails.captured,
        }),
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Payment verification failed - Invalid signature",
      });
    }

  } catch (err) {
    console.error("Verify Payment Error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Payment verification failed",
    });
  }
});

/**
 * POST /api/payment/webhook
 * Razorpay Webhook Endpoint (for server-to-server communication)
 * Configure this URL in Razorpay Dashboard -> Webhooks
 */
router.post("/webhook", async (req, res) => {
  try {
    // Verify webhook signature
    const webhookSignature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      console.error("Webhook signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body.event;
    const paymentData = req.body.payload.payment.entity;

    console.log("Webhook Event:", event);
    console.log("Payment Data:", paymentData);

    switch (event) {
      case "payment.captured":
        // Payment successfully captured
        console.log("Payment captured:", paymentData.id);
        // You can update your database here if needed
        break;

      case "payment.failed":
        // Payment failed
        console.log("Payment failed:", paymentData.id, paymentData.error_description);
        break;

      case "payment.authorized":
        // Payment authorized (for some payment methods)
        console.log("Payment authorized:", paymentData.id);
        break;

      default:
        console.log("Unhandled webhook event:", event);
    }

    // Always return 200 to acknowledge receipt
    res.json({ status: "ok" });

  } catch (err) {
    console.error("Webhook Error:", err);
    // Still return 200 to prevent retry
    res.json({ status: "ok" });
  }
});

module.exports = router;