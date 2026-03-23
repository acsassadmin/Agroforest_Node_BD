const express = require('express');
const router = express.Router();
const targetDepartmentController = require('../controllers/Target/targetDepartmentController'); // correct path

// CRUD routes
router.post('/', targetDepartmentController.createTargetDepartment);
router.get('/', targetDepartmentController.getAllTargetDepartments);
router.get('/:id', targetDepartmentController.getTargetDepartmentById);
router.put('/:id', targetDepartmentController.updateTargetDepartment);
router.delete('/:id', targetDepartmentController.deleteTargetDepartment);

module.exports = router;