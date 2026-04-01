const express = require('express');
const router = express.Router();
const userController = require('../controllers/users/userController');
const authenticateToken = require('../middleware/authMiddleware'); // Import Middleware

// ======================================================================

// --- Public Routes (No Authentication Required) ---
// router.post('/register/', userController.register);
router.post('/login/', userController.sendLoginOtp);
router.post('/verify-otp/', userController.verifyLoginOtp);
// router.post('/reset-password/', userController.resetPassword);
// router.post('/forgot-password/', userController.forgotPassword);
router.post('/refresh/', userController.refreshToken);
router.get('/roles/', userController.getRoles); 

// --- Protected Routes (Authentication Required) ---
router.post('/farmer-request/', authenticateToken, userController.farmerRequest);
router.put('/approve-item/:id', authenticateToken, userController.approveItem);
router.post('/farmer-aadhar/', authenticateToken, userController.createFarmer);
router.get('/farmer-aadhar/', userController.getFarmerAadhar);
router.get('/get-aadhar/', userController.getAadhar);


// Farmer Registration Flow
router.post('/farmer/check-aadhar/', userController.checkAadharForRegistration);
router.post('/farmer/register-non-farmer/', userController.registerNonFarmer);
router.get('/farmer-request/', authenticateToken, userController.getCenterOrders);
router.put('/farmer-aadhar/:id', userController.updateFarmer);

router.get('/tn-schema/', authenticateToken, userController.getTnSchemas);
router.put('/request-header/:id', authenticateToken, userController.updateRequestHeader);
router.post('/order-placed/', authenticateToken, userController.orderPlaced);
router.get('/farmer-request-items/', userController.getFarmerRequestItemByStockId);
// ======================================================================

router.get('/dashboard/top-centers', authenticateToken, userController.getTopProductionCenters);
router.get('/dashboard/district-saplings', authenticateToken, userController.getSaplingsDistrictWise);
// Map Data
router.get('/production-centers/map', authenticateToken, userController.getProductionCentersForMap);


// ----------------Officer Dashboards--------------
router.get('/dashboard-counts/', authenticateToken, userController.getDashboardCounts);
router.get('/farmer-request-weekly-report/', authenticateToken, userController.getWeeklyFarmerRequestReport);
router.get('/production-centers', authenticateToken, userController.getProductionCentersList);
router.get('/target-details/', authenticateToken, userController.getTargetDetails);
router.get('/farmer-details/', authenticateToken, userController.getFarmerDetails);

// ----------------Production center Dashboards--------------

router.get('/production-counts/', authenticateToken, userController.getProductionCenterStats);
router.get('/production-saplings/', authenticateToken, userController.getProductionCenterSaplings);
router.get('/production-monthly-sales/', authenticateToken, userController.getMonthlyTotalSales);





module.exports = router;