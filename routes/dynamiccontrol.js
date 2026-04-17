const express = require('express');
const { 
  uploadDashboardCarousel, 
  getDashboardCarousel, 
  deleteDashboardCarousel, 
  uploadDashboardScheme, 
  getDashboardSchemes,
  updateDashboardScheme, // NEW
  deleteDashboardScheme  // NEW
} = require('../controllers/DynamicController/dynamicController');
const upload = require('../Multer/upload');
const router = express.Router();

// --- Dashboard Carousel Routes ---
router.post('/dashboard-carousel/upload', upload.array('images', 10), uploadDashboardCarousel);
router.get('/dashboard-carousel', getDashboardCarousel);
router.post('/dashboard-carousel/delete', deleteDashboardCarousel);

// --- Dashboard Schemes Routes ---
router.post('/dashboard-schemes/upload', upload.single('scheme_image'), uploadDashboardScheme);
router.get('/dashboard-schemes', getDashboardSchemes);

// --- NEW: Edit & Delete Scheme Routes ---
// Use upload.single for update in case user changes the image
router.put('/dashboard-schemes', upload.single('scheme_image'), updateDashboardScheme);
router.delete('/dashboard-schemes/:id', deleteDashboardScheme);

module.exports = router;