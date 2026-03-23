const express = require('express');
const router = express.Router();
const officerController = require('../controllers/Officer/officerController');  // Correct path
router.get('/', officerController.getOfficers); 
router.get('/:id', officerController.getOfficerById); 
router.post('/', officerController.createOfficer); 
router.put('/:id', officerController.updateOfficer); 
router.delete('/:id', officerController.deleteOfficer); 

router.get('/departments', officerController.getDepartments);
router.post("/departments", officerController.createDepartment);
router.post("/designations", officerController.createDesignation);
router.get('/designations', officerController.getDesignations); 
router.get('/usernames', officerController.getUsernames); 

module.exports = router;