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
router.post('/approve-item/', authenticateToken, userController.approveItem);
router.post('/farmer-aadhar/', authenticateToken, userController.createFarmer);
router.get('/farmer-aadhar/', authenticateToken, userController.getFarmerAadhar);


// ======================================================================

module.exports = router;