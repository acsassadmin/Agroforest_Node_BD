const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const user = require('../controllers/users/userController');
const prodController = require('../controllers/Production/productionCenterController');
const distController = require('../controllers/Production/distributionCenterController');



// This matches your Django urlpatterns exactly

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

// --- Types Routes ---
router.get('/production-center-types/', prodController.getProductionCenterTypes);
router.post('/production-center-types/', prodController.createProductionCenterType);
router.put('/production-center-types/', prodController.updateProductionCenterType);
router.delete('/production-center-types/', prodController.deleteProductionCenterType);

// ----Production Centers-------
router.get('/production-centers/', prodController.getProductionCenters);
router.post('/production-centers/', prodController.uploadMiddleware, prodController.createProductionCenter);
router.put('/production-centers/', prodController.uploadMiddleware, prodController.updateProductionCenter);
router.delete('/production-centers/', prodController.deleteProductionCenter);





// AUTH
router.post("/register", user.register);
router.post("/verify-otp", user.verifyOtp);
router.post("/login", user.login);

// ROLE
router.get("/roles", user.getRoles);
router.post("/roles", user.createRole);
router.put("/roles", user.updateRole);
router.delete("/roles", user.deleteRole);

// FARMER
router.get("/farmer-aadhar", user.getFarmer);
router.post("/farmer-aadhar", user.createFarmer);
router.put("/farmer-aadhar", user.updateFarmer);
router.delete("/farmer-aadhar", user.deleteFarmer);

// REQUEST
router.post("/farmer-request", user.createRequest);
router.post("/approve-item", user.updateRequestItem);

// ----Distribution Centers-------
router.get('/distribution-centers/', distController.getDistributionCenters);
router.post('/distribution-centers/', distController.createDistributionCenter);
router.put('/distribution-centers/', distController.updateDistributionCenter);
router.delete('/distribution-centers/', distController.deleteDistributionCenter);


module.exports = router;