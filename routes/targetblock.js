const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware'); 
const targetBlockController = require('../controllers/Target/targetBlockController');

// Standard CRUD
router.post('/', authenticateToken, targetBlockController.createTargetBlock);

// Ensure this GET route handles query params correctly (?page=1&limit=10&district_id=5)
router.get('/', authenticateToken, targetBlockController.getAllTargetBlocks);

router.put('/:id', authenticateToken, targetBlockController.updateTargetBlock);
router.delete('/:id', authenticateToken, targetBlockController.deleteTargetBlock);
// If your route looks like this, it might be blocking District Admins:

module.exports = router;