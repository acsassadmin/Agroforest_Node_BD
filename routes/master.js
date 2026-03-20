const express = require('express');
const router = express.Router();

const masterController = require('../controllers/Masters/masterController');
const authenticateToken = require('../middleware/authMiddleware');

// URL: /master/blocks
router.get('/blocks',authenticateToken ,  masterController.getBlocks);

// URL: /master/villages
router.get('/villages',authenticateToken ,  masterController.getVillages);

// URL: /master/districts
router.get('/districts', authenticateToken , masterController.getDistricts);

module.exports = router;