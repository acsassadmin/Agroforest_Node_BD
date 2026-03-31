const express = require('express');
const router = express.Router();

// ✅ ADD THIS LINE: Your exact middleware path
const authenticateToken = require('../middleware/authMiddleware'); 

// ✅ KEEP YOUR EXACT CONTROLLER PATH
const targetDistrictController = require('../controllers/Target/targetDistrictController');

// ✅ ADD authenticateToken TO ALL ROUTES
router.post('/targetdist/', authenticateToken, targetDistrictController.createTargetDistrict);
router.get('/', authenticateToken, targetDistrictController.getAllTargetDistricts);
router.get('/:id', authenticateToken, targetDistrictController.getTargetDistrictById);
router.put('/:id', authenticateToken, targetDistrictController.updateTargetDistrict);
router.delete('/:id', authenticateToken, targetDistrictController.deleteTargetDistrict);

module.exports = router;