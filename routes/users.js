const express = require('express');
const router = express.Router();
const userController = require('../controllers/users/userController');

// Authentication Routes
router.post('/register/', userController.register);
router.post('/verify-otp/', userController.verifyOtp);
router.post('/login/', userController.login);
router.post('/refresh/', userController.refreshToken);

// Application Routes
router.post('/farmer-request/', userController.farmerRequest);
router.post('/approve-item/', userController.approveItem);
router.get('/roles/', userController.getRoles);
router.post('/farmer-aadhar/', userController.farmerAadhar);
// ======================================================================


module.exports = router;