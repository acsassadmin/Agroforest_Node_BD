const express = require("express");
const router = express.Router();
const targetController = require("../controllers/Target/targetController");

router.post("/create", targetController.createTarget);
router.get("/dropdown", targetController.getAvailableItems);
router.patch("/edit", targetController.editTarget);
router.get('/table-data', targetController.getTableData);
router.get("/all", targetController.getAllTargets); 


module.exports = router;