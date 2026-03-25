const express = require('express');
const router = express.Router();
const targetDistrictController = require('../controllers/Target/targetDistrictController');
router.post('/targetdist/', targetDistrictController.createTargetDistrict);
router.get('/', targetDistrictController.getAllTargetDistricts);
router.get('/:id', targetDistrictController.getTargetDistrictById);
router.put('/:id', targetDistrictController.updateTargetDistrict);
router.delete('/:id', targetDistrictController.deleteTargetDistrict);



module.exports = router;