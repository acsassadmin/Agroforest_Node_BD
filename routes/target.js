const express = require("express");
const router = express.Router();
const targetController = require("../controllers/Target/targetController");

router.post("/create", targetController.createTarget);
router.get("/dropdown", targetController.getAvailableItems);
router.patch("/edit", targetController.editTarget);
module.exports = router;