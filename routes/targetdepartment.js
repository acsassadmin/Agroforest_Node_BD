const express = require('express');
const router = express.Router();
const targetDepartmentController = require('../controllers/Target/targetdepartmentController');
// ===================== CRUD ROUTES =====================

// Create a new target department
router.post('/', targetDepartmentController.createTargetDepartment);

// Get all target departments
router.get('/', targetDepartmentController.getAllTargetDepartments);

// Get a single target department by ID
router.get('/:id', targetDepartmentController.getTargetDepartmentById);

// Update a target department by ID
router.put('/:id', targetDepartmentController.updateTargetDepartment);

// Delete a target department by ID
router.delete('/:id', targetDepartmentController.deleteTargetDepartment);

// ===================== EXTRA ROUTE =====================

// Get all departments for dropdown
router.get('/dropdown/list', targetDepartmentController.getDepartments);

module.exports = router;