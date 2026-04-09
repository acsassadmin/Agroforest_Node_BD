const express = require('express');
const router = express.Router();
const officerController = require('../controllers/Officer/officerController');  // Correct path
const upload = require('../Multer/upload');

// Officer routes
router.get('/officer', officerController.getOfficers);
router.get('/officer/:id', officerController.getOfficerById);
router.post('/register-officer', officerController.registerOfficer); // Fixed typo
router.put('/officer/:id', officerController.updateOfficer);
router.delete('/officer/:id', officerController.deleteOfficer);

// Department routes
router.get('/departments', officerController.getDepartments);
router.post('/departments', officerController.createDepartment);
router.put('/departments', officerController.updateDepartment);
router.delete('/departments', officerController.deleteDepartment);
router.post("/designations", officerController.createDesignation);
router.get("/designations", officerController.getDesignation);
router.put("/designations", officerController.updateDesignation);
router.delete("/designations/:id", officerController.deleteDesignation);
router.get('/usernames', officerController.getUsernames); 
router.post("/Contact/", officerController.SendEmail);
router.delete('/departments/:id', officerController.deleteDepartment);

// Designation routes
router.get('/designations', officerController.getDesignation);
router.post('/designations', officerController.createDesignation);
router.put('/designations', officerController.updateDesignation);
router.delete('/designations/:id', officerController.deleteDesignation);

// Usernames
router.get('/usernames', officerController.getUsernames);

// Inspection routes
router.post('/assign-inspection', officerController.assignInspection);
router.get('/get-formers-orders/:userid/:role', officerController.getFarmerOrders);
router.put('/approve-inspection/:id', officerController.approveInspection);
router.put('/reject-inspection/:id', officerController.rejectInspection);
router.post('/upload-inspection-sappling',upload.single("image"), officerController.uploadInspectionDetails);

module.exports = router;
