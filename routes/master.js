const express = require('express');
const router = express.Router();

const masterController = require('../controllers/Masters/masterController');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/blocks',authenticateToken ,  masterController.getBlocks);

router.get('/villages',authenticateToken ,  masterController.getVillages);

router.get('/districts', authenticateToken , masterController.getDistricts);

module.exports = router;