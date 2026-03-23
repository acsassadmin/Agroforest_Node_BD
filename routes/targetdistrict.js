const express = require('express');
const router = express.Router();
const targetDistrictController = require('../controllers/Target/targetDistrictController');
router.post('/', targetDistrictController.createTargetDistrict);
router.get('/', targetDistrictController.getAllTargetDistricts);
router.get('/:id', targetDistrictController.getTargetDistrictById);
router.put('/:id', targetDistrictController.updateTargetDistrict);
router.delete('/:id', targetDistrictController.deleteTargetDistrict);

// Dropdown routes
router.get('/dropdown/departments', targetDistrictController.getTargetDepartments);
router.get('/dropdown/districts', targetDistrictController.getDistricts);

module.exports = router;