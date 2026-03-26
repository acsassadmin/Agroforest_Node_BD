const express = require('express');
const router = express.Router();
const prodController = require('../controllers/Production/productionCenterController');
const distController = require('../controllers/Production/distributionCenterController');
const stockController = require('../controllers/Production/stockController');
const authenticateToken = require('../middleware/authMiddleware'); 

// --- Types Routes ---
router.get('/production-center-types/', authenticateToken, prodController.getProductionCenterTypes);
router.post('/production-center-types/', authenticateToken, prodController.createProductionCenterType);
router.put('/production-center-types/', authenticateToken, prodController.updateProductionCenterType);
router.delete('/production-center-types/', authenticateToken, prodController.deleteProductionCenterType);

// ----Production Centers-------
router.get('/production-centers/', authenticateToken, prodController.getProductionCenters);
router.post('/production-centers/', authenticateToken, prodController.uploadMiddleware, prodController.createProductionCenter);
router.put('/production-centers/', authenticateToken, prodController.uploadMiddleware, prodController.updateProductionCenter);
router.delete('/production-centers/', authenticateToken, prodController.deleteProductionCenter);

// -----------getNearbyProductionCenters ---------------
router.get('/production-centers-nearby/', authenticateToken, prodController.getNearbyProductionCenters);

//report
router.get('/district-summary/', authenticateToken, prodController.getDistrictSummary);
router.get('/districts/summary', authenticateToken, prodController.getSingleDistrictSummary);
// ----Distribution Centers-------
router.get('/distribution-centers/', authenticateToken, distController.getDistributionCenters);
router.post('/distribution-centers/', authenticateToken, distController.createDistributionCenter);
router.put('/distribution-centers/', authenticateToken, distController.updateDistributionCenter);
router.delete('/distribution-centers/', authenticateToken, distController.deleteDistributionCenter);

// Stock Details
router.get('/stock-details/', authenticateToken, stockController.getStockDetails);
router.post('/stock-details/', authenticateToken,stockController.uploadMiddleware, stockController.createStockDetail);
router.put('/stock-details/', authenticateToken, stockController.updateStockDetail);
router.delete('/stock-details/', authenticateToken, stockController.deleteStockDetail);

router.get('/trees', authenticateToken, stockController.getSpecies);

// Targets
router.get('/targets/', authenticateToken, stockController.getTargets);
router.post('/targets/', authenticateToken, stockController.createTarget);
router.put('/targets/', authenticateToken, stockController.updateTarget);
router.delete('/targets/', authenticateToken, stockController.deleteTarget);

// Stock Requests
router.get('/stock-requests/', authenticateToken, stockController.getStockRequests);
router.post('/stock-requests/', authenticateToken, stockController.createStockRequest);
router.put('/stock-requests/', authenticateToken, stockController.handleStockRequest);

// Excel & Dashboard
router.get('/production-centers/excel/', authenticateToken, stockController.downloadExcel);
router.get('/dashboard-summary/', authenticateToken, stockController.getDashboardSummary);


// GET ALL (uses same function as below)
router.get('/schema/', authenticateToken, stockController.getScheme);
router.get('/schema/:id', authenticateToken, stockController.getScheme);
router.post('/schema/', authenticateToken, stockController.createScheme);
router.put('/schema/:id', authenticateToken, stockController.updateScheme);
router.delete('/schema/:id', authenticateToken, stockController.deleteScheme);


















module.exports = router;










