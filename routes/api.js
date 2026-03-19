const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
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

// ----Distribution Centers-------
router.get('/distribution-centers/', distController.getDistributionCenters);
router.post('/distribution-centers/', distController.createDistributionCenter);
router.put('/distribution-centers/', distController.updateDistributionCenter);
router.delete('/distribution-centers/', distController.deleteDistributionCenter);


module.exports = router;