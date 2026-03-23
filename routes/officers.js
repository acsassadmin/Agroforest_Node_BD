const express = require('express');
const router = express.Router();
const officerController = require('../controllers/Officer/officerController');





router.post('/register', officerController.registerOfficer);


router.get('/departments', officerController.getDepartments);
router.post('/departments', officerController.createDepartment);

router.get('/designations', officerController.getDesignations); 
router.post('/designations', officerController.createDesignation);

router.get('/usernames', officerController.getUsernames);



router.get('/', officerController.getOfficers); 
router.get('/:id', officerController.getOfficerById); 
router.put('/:id', officerController.updateOfficer);
router.delete('/:id', officerController.deleteOfficer);

module.exports = router;