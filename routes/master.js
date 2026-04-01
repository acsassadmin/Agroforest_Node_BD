const express = require('express');
const router = express.Router();

const masterController = require('../controllers/Masters/masterController');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/blocks',   masterController.getBlocks);

router.get('/villages',  masterController.getVillages);

router.get('/districts',  masterController.getDistricts);

module.exports = router;