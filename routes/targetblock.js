const express = require('express');
const router = express.Router();

const targetBlockController = require('../controllers/Target/targetBlockController');

// CRUD routes
router.post('/', targetBlockController.createTargetBlock);
router.get('/', targetBlockController.getAllTargetBlocks);
router.get('/:id', targetBlockController.getTargetBlockById);
router.put('/:id', targetBlockController.updateTargetBlock);
router.delete('/:id', targetBlockController.deleteTargetBlock);



module.exports = router;