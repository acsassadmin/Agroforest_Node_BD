const express = require("express");
const router = express.Router();
const reportController = require("../controllers/report/reportController");


router.get("/download", reportController.generateReportExcel);

module.exports = router;