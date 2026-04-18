const db = require("../../db");

// --- 1. Upload Dashboard Carousel ---
exports.uploadDashboardCarousel = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
   
    const files = req.files;
    const values = [];

    // Fixed URL syntax: added 'http://' and '3001' based on your context
    const baseUrl = 'https://192.168.1.37:3001/uploads/'; 

    files.forEach(file => {
      const imageUrl = `${baseUrl}${file.filename}`;
      values.push([imageUrl]);
    });

    const sql = "INSERT INTO dashboardcarouselimages (imageurl) VALUES ?";
    
    // ADDED AWAIT to ensure database write finishes
    await db.query(sql, [values]);
    
    res.status(201).json({ message: "Images uploaded successfully", count: files.length });

  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// --- 2. Get Dashboard Carousel ---
exports.getDashboardCarousel = async (req, res) => {
  try {
    const sql = "SELECT * FROM dashboardcarouselimages ORDER BY id DESC";
    const [result] = await db.query(sql);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Get Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

// --- 3. Delete Dashboard Carousel --- 
exports.deleteDashboardCarousel = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Invalid IDs" });
    }

    const placeholders = ids.map(() => '?').join(',');
    const sql = `DELETE FROM dashboardcarouselimages WHERE id IN (${placeholders})`;

    // ADDED AWAIT
    await db.query(sql, ids);
    
    res.json({ message: "Deleted successfully", affectedRows: ids.length });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Database error" });
  }
};

// --- 4. Upload Dashboard Scheme ---
exports.uploadDashboardScheme = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No scheme image uploaded" });
    if (!req.body.about_scheme_en) return res.status(400).json({ error: "English scheme details are required" });
    if (!req.body.about_scheme_ta) return res.status(400).json({ error: "Tamil scheme details are required" });

    const file = req.file;
    const baseUrl = 'https://192.168.1.37:3001/uploads/'; 
    const imageUrl = `${baseUrl}${file.filename}`;
    
    // Get English Data
    const aboutSchemeEn = req.body.about_scheme_en;
    let preferredSpeciesEn = [];
    try {
        preferredSpeciesEn = JSON.parse(req.body.preferred_species_en);
    } catch (e) {
        return res.status(400).json({ error: "Invalid English preferred species format" });
    }

    // Get Tamil Data
    const aboutSchemeTa = req.body.about_scheme_ta;
    let preferredSpeciesTa = [];
    try {
        preferredSpeciesTa = JSON.parse(req.body.preferred_species_ta);
    } catch (e) {
        return res.status(400).json({ error: "Invalid Tamil preferred species format" });
    }

    // SQL Insert with new columns
    const sql = "INSERT INTO dashboard_schemes (image_url, about_scheme_en, about_scheme_ta, preferred_species_en, preferred_species_ta) VALUES (?, ?, ?, ?, ?)";
    
    await db.query(sql, [imageUrl, aboutSchemeEn, aboutSchemeTa, JSON.stringify(preferredSpeciesEn), JSON.stringify(preferredSpeciesTa)]);
    
    res.status(201).json({ message: "Scheme uploaded successfully" });

  } catch (error) {
    console.error("Upload Scheme Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// --- 2. Get Dashboard Schemes ---
exports.getDashboardSchemes = async (req, res) => {
  try {
    // Selecting the new specific columns
    const sql = "SELECT id, image_url, about_scheme_en, about_scheme_ta, preferred_species_en, preferred_species_ta FROM dashboard_schemes ORDER BY id DESC";
    const [results] = await db.query(sql);

    const parsedResults = results.map(row => ({
      ...row,
      preferred_species_en: JSON.parse(row.preferred_species_en || '[]'),
      preferred_species_ta: JSON.parse(row.preferred_species_ta || '[]')
    }));
    
    res.json(parsedResults);
  } catch (error) {
    console.error("Get Schemes Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// --- 3. UPDATE (Edit) Dashboard Scheme ---
exports.updateDashboardScheme = async (req, res) => {
  try {
    const { id, about_scheme_en, about_scheme_ta, preferred_species_en, preferred_species_ta, existing_image } = req.body;

    if (!id) return res.status(400).json({ error: "Scheme ID is required" });

    let imageUrl = existing_image; 

    // Check if a new file is uploaded
    if (req.file) {
      const baseUrl = 'https://192.168.1.37:3001/uploads/';
      imageUrl = `${baseUrl}${req.file.filename}`;
    }

    // Update SQL with bilingual columns
    const sql = "UPDATE dashboard_schemes SET image_url = ?, about_scheme_en = ?, about_scheme_ta = ?, preferred_species_en = ?, preferred_species_ta = ? WHERE id = ?";
    
    await db.query(sql, [
      imageUrl, 
      about_scheme_en, 
      about_scheme_ta, 
      preferred_species_en, 
      preferred_species_ta, 
      id
    ]);
    
    res.json({ message: "Scheme updated successfully" });

  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
// --- 7. DELETE Dashboard Scheme ---
exports.deleteDashboardScheme = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ error: "ID is required" });

    const sql = "DELETE FROM dashboard_schemes WHERE id = ?";
    
    // ADDED AWAIT
    await db.query(sql, [id]);
    
    res.json({ message: "Scheme deleted successfully" });

  } catch (error) {
    console.error("Delete Scheme Error:", error);
    res.status(500).json({ error: "Server error" });
  }
}; 