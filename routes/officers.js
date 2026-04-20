const express = require('express');
const router = express.Router();
const officerController = require('../controllers/Officer/officerController');
const upload = require('../Multer/upload');
const { getScheme } = require('../controllers/Production/stockController');

// ============================================
// OFFICER ROUTES
// ============================================
router.get('/officer', officerController.getOfficers);
router.get('/officer/:id', officerController.getOfficerById);
router.post('/register-officer', officerController.registerOfficer);
router.put('/officer/:id', officerController.updateOfficer);
router.delete('/officer/:id', officerController.deleteOfficer);

// ============================================
// DEPARTMENT ROUTES
// ============================================
router.get('/departments', officerController.getDepartments);
router.post('/departments', officerController.createDepartment);
router.put('/departments', officerController.updateDepartment);
router.delete('/departments/:id', officerController.deleteDepartment);

// ============================================
// DESIGNATION ROUTES
// ============================================
router.get('/designations', officerController.getDesignation);
router.post('/designations', officerController.createDesignation);
router.put('/designations', officerController.updateDesignation);
router.delete('/designations/:id', officerController.deleteDesignation);

// ============================================
// USERNAMES
// ============================================
router.get('/usernames', officerController.getUsernames);

// Get farmer orders - MODIFIED (removed free of cost filter, added field_inspector village matching)
router.get('/get-formers-orders/:userid/:role', officerController.getFarmerOrders);

// NEW: Create inspection - For field inspectors to start inspection
router.post('/create-inspection', officerController.createInspection);

// Upload inspection details with image - MODIFIED
router.post('/upload-inspection-sappling', upload.single("image"), officerController.uploadInspectionDetails);

// Approve inspection - MODIFIED (removed next_inspection_date logic)
router.put('/approve-inspection/:id', officerController.approveInspection);

// Reject inspection - MODIFIED
router.put('/reject-inspection/:id', officerController.rejectInspection);

// ============================================
// SCHEME & PRODUCTION CENTER ROUTES
// ============================================
router.get("/get-all-schemes", getScheme);
router.get("/get-producion-center/:userid/:role", officerController.getProductionCenters);
router.post("/assign-schemes", officerController.assignSchemes);
router.get("/get-valid-schemes/:id", officerController.getPrivateValidSchemes);

module.exports = router;