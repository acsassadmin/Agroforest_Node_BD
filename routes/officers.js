const express = require('express');
const router = express.Router();
const officerController = require('../controllers/Officer/officerController');  // Correct path
// Officer Routes (Already Defined)
router.get('/', officerController.getOfficers); 
router.get('/:id', officerController.getOfficerById); 
router.post('/', officerController.createOfficer); 
router.put('/:id', officerController.updateOfficer); 
router.delete('/:id', officerController.deleteOfficer); 

// GET Routes for Department, Designation, Username
router.get('/departments', officerController.getDepartments); 
router.get('/designations', officerController.getDesignations); 
router.get('/usernames', officerController.getUsernames); 

module.exports = router;