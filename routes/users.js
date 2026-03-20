const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

// Authentication Routes
router.post('/register/', apiController.register);
router.post('/verify-otp/', apiController.verifyOtp);
router.post('/login/', apiController.login);
router.post('/refresh/', apiController.refreshToken);

// Application Routes
router.post('/farmer-request/', apiController.farmerRequest);
router.post('/approve-item/', apiController.approveItem);
router.get('/roles/', apiController.getRoles);
router.post('/farmer-aadhar/', apiController.farmerAadhar);
// ======================================================================


module.exports = router;