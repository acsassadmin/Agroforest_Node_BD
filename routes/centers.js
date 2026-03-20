const express = require('express');
const router = express.Router();
const prodController = require('../controllers/Production/productionCenterController');
const distController = require('../controllers/Production/distributionCenterController');
const stockController = require('../controllers/Production/stockController');

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

// Stock Details
router.get('/stock-details/', stockController.getStockDetails);
router.post('/stock-details/', stockController.createStockDetail);
router.put('/stock-details/', stockController.updateStockDetail);
router.delete('/stock-details/', stockController.deleteStockDetail);

// Targets
router.get('/targets/', stockController.getTargets);
router.post('/targets/', stockController.createTarget);
router.put('/targets/', stockController.updateTarget);
router.delete('/targets/', stockController.deleteTarget);

// Stock Requests
router.get('/stock-requests/', stockController.getStockRequests);
router.post('/stock-requests/', stockController.createStockRequest);
router.put('/stock-requests/', stockController.handleStockRequest);

// Excel & Dashboard
router.get('/production-centers/excel/', stockController.downloadExcel);
router.get('/dashboard-summary/', stockController.getDashboardSummary);


module.exports = router;