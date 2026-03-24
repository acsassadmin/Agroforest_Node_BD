const express = require('express');
const router = express.Router();
const officerController = require('../controllers/Officer/officerController');  // Correct path
router.get('/officer/', officerController.getOfficers); 
router.get('/officer/:id', officerController.getOfficerById);
router.post('/register-officer', officerController.registerOfficer);
router.put('/officer/:id', officerController.updateOfficer); 
router.delete('/officer/:id', officerController.deleteOfficer); 

router.get('/departments', officerController.getDepartments);
router.post("/departments", officerController.createDepartment);
router.post("/designations", officerController.createDesignation);
router.put("/designations", officerController.updateDesignation);
router.delete("/designations", officerController.deleteDesignation);
router.delete("/designations/:id", officerController.deleteDesignation);
router.get('/usernames', officerController.getUsernames); 

module.exports = router;