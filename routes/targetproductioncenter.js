const express = require('express');
const router = express.Router();

const targetProductionCenterController = require('../controllers/Target/targetProductionCenterController');

// CRUD
router.post('/', targetProductionCenterController.createTargetProductionCenter);
router.get('/', targetProductionCenterController.getAllTargetProductionCenters);
router.get('/:id', targetProductionCenterController.getTargetProductionCenterById);
router.put('/:id', targetProductionCenterController.updateTargetProductionCenter);
router.delete('/:id', targetProductionCenterController.deleteTargetProductionCenter);

// Dropdowns
router.get('/dropdown/productioncenters', targetProductionCenterController.getProductionCenters);
router.get('/dropdown/departments', targetProductionCenterController.getTargetDepartments);

module.exports = router;