const express = require('express');
const router = express.Router();
const userController = require('../controllers/users/userController');
const authenticateToken = require('../middleware/authMiddleware'); // Import Middleware

// ======================================================================

// --- Public Routes (No Authentication Required) ---
router.post('/register/', userController.register);
router.post('/verify-otp/', userController.verifyOtp);
router.post('/login/', userController.login);
router.post('/refresh/', userController.refreshToken);
router.get('/roles/', userController.getRoles); 

// --- Protected Routes (Authentication Required) ---
router.post('/farmer-request/', authenticateToken, userController.farmerRequest);
router.put('/approve-item/:id', authenticateToken, userController.approveItem);
router.post('/farmer-aadhar/', authenticateToken, userController.createFarmer);
router.get('/farmer-aadhar/', authenticateToken, userController.getFarmerAadhar);
router.get('/farmer-request/', authenticateToken, userController.getCenterOrders);
router.put('/farmer-aadhar/:id', userController.updateFarmer);

router.get('/tn-schema/', authenticateToken, userController.getTnSchemas);
router.put('/request-header/:id', authenticateToken, userController.updateRequestHeader);
router.post('/order-placed/', authenticateToken, userController.orderPlaced);

// ======================================================================

module.exports = router;