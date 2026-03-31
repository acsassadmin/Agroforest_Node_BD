const express = require('express');
const router = express.Router();

const targetProductionCenterController = require('../controllers/Target/targetProductionCenterController');

// ✅ ADD THIS LINE: Import your authentication middleware
const authMiddleware = require('../middleware/authMiddleware'); 

// ✅ ADD authMiddleware to all these routes
router.post('/', authMiddleware, targetProductionCenterController.createTargetProductionCenter);
router.get('/', authMiddleware, targetProductionCenterController.getAllTargetProductionCenters);
router.get('/:id', authMiddleware, targetProductionCenterController.getTargetProductionCenterById);
router.put('/:id', authMiddleware, targetProductionCenterController.updateTargetProductionCenter);
router.delete('/:id', authMiddleware, targetProductionCenterController.deleteTargetProductionCenter);

module.exports = router;