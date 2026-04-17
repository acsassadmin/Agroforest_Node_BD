const express = require('express');
const router = express.Router();
const targetDepartmentController = require('../controllers/Target/targetdepartmentController');// correct path

// CRUD routes
router.get("/allocation-summary-all", targetDepartmentController.getAllAllocationSummary);
router.post('/', targetDepartmentController.createTargetDepartment);
router.get('/', targetDepartmentController.getAllTargetDepartments);
router.get('/:id', targetDepartmentController.getTargetDepartmentById);
router.put('/:id', targetDepartmentController.updateTargetDepartment);
router.delete('/:id', targetDepartmentController.deleteTargetDepartment);
router.get('/schemes/all', targetDepartmentController.getAllSchemes);

module.exports = router;