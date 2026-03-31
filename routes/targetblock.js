const express = require('express');
const router = express.Router();

// ✅ ADD THIS LINE
const authenticateToken = require('../middleware/authMiddleware'); 

const targetBlockController = require('../controllers/Target/targetBlockController');

// ✅ ADD authenticateToken TO ALL ROUTES
router.post('/', authenticateToken, targetBlockController.createTargetBlock);
router.get('/', authenticateToken, targetBlockController.getAllTargetBlocks);
router.get('/:id', authenticateToken, targetBlockController.getTargetBlockById);
router.put('/:id', authenticateToken, targetBlockController.updateTargetBlock);
router.delete('/:id', authenticateToken, targetBlockController.deleteTargetBlock);

module.exports = router;