const express = require('express');
const router = express.Router();

const targetProductionCenterController = require('../controllers/Target/targetProductionCenterController');
const authenticateToken = require('../middleware/authMiddleware'); 

// SPECIFIC ROUTES MUST BE FIRST
router.get('/productioncenters', authenticateToken, targetProductionCenterController.getProductionCentersByBlock);

// STANDARD CRUD ROUTES
router.post('/', authenticateToken, targetProductionCenterController.createTargetProductionCenter);
router.get('/', authenticateToken, targetProductionCenterController.getAllTargetProductionCenters);
router.get('/:id', authenticateToken, targetProductionCenterController.getTargetProductionCenterById);
router.put('/:id', authenticateToken, targetProductionCenterController.updateTargetProductionCenter);
router.delete('/:id', authenticateToken, targetProductionCenterController.deleteTargetProductionCenter);

module.exports = router;