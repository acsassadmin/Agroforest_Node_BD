const db = require("../../db");
require("dotenv").config();

// Helper to attach BASE_URL when sending response
const withBaseUrl = (path) => {
  if (!path) return null;
  return `${process.env.BASE_URL}${path}`;
};

// --- 1. Upload Dashboard Carousel ---
exports.uploadDashboardCarousel = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // ✅ store only relative path
    const values = req.files.map(file => [`/uploads/${file.filename}`]);

    const sql = "INSERT INTO dashboardcarouselimages (imageurl) VALUES ?";
    await db.query(sql, [values]);

    res.status(201).json({
      message: "Images uploaded successfully",
      count: req.files.length
    });

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

    // ✅ attach BASE_URL here
    const updated = result.map(item => ({
      ...item,
      imageurl: withBaseUrl(item.imageurl)
    }));

    res.status(200).json(updated);

  } catch (error) {
    console.error("Get Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// --- 3. Delete Dashboard Carousel ---
exports.deleteDashboardCarousel = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Invalid IDs" });
    }

    const placeholders = ids.map(() => "?").join(",");
    const sql = `DELETE FROM dashboardcarouselimages WHERE id IN (${placeholders})`;

    await db.query(sql, ids);

    res.json({
      message: "Deleted successfully",
      affectedRows: ids.length
    });

  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Database error" });
  }
};

// --- 4. Upload Dashboard Scheme ---
exports.uploadDashboardScheme = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No scheme image uploaded" });
    }

    if (!req.body.about_scheme_en || !req.body.about_scheme_ta) {
      return res.status(400).json({ error: "Scheme details are required (EN & TA)" });
    }

    // ✅ store only relative path
    const imageUrl = `/uploads/${req.file.filename}`;

    let preferredSpeciesEn = [];
    let preferredSpeciesTa = [];

    try {
      preferredSpeciesEn = JSON.parse(req.body.preferred_species_en || "[]");
      preferredSpeciesTa = JSON.parse(req.body.preferred_species_ta || "[]");
    } catch (e) {
      return res.status(400).json({ error: "Invalid preferred species format" });
    }

    const sql = `
      INSERT INTO dashboard_schemes 
      (image_url, about_scheme_en, about_scheme_ta, preferred_species_en, preferred_species_ta) 
      VALUES (?, ?, ?, ?, ?)
    `;

    await db.query(sql, [
      imageUrl,
      req.body.about_scheme_en,
      req.body.about_scheme_ta,
      JSON.stringify(preferredSpeciesEn),
      JSON.stringify(preferredSpeciesTa)
    ]);

    res.status(201).json({ message: "Scheme uploaded successfully" });

  } catch (error) {
    console.error("Upload Scheme Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// --- 5. Get Dashboard Schemes ---
exports.getDashboardSchemes = async (req, res) => {
  try {
    const sql = `
      SELECT id, image_url, about_scheme_en, about_scheme_ta, 
             preferred_species_en, preferred_species_ta 
      FROM dashboard_schemes 
      ORDER BY id DESC
    `;

    const [results] = await db.query(sql);

    const parsedResults = results.map(row => ({
      ...row,
      image_url: withBaseUrl(row.image_url), // ✅ attach here
      preferred_species_en: JSON.parse(row.preferred_species_en || "[]"),
      preferred_species_ta: JSON.parse(row.preferred_species_ta || "[]")
    }));

    res.json(parsedResults);

  } catch (error) {
    console.error("Get Schemes Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// --- 6. Update Dashboard Scheme ---
exports.updateDashboardScheme = async (req, res) => {
  try {
    const {
      id,
      about_scheme_en,
      about_scheme_ta,
      preferred_species_en,
      preferred_species_ta,
      existing_image
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Scheme ID is required" });
    }

    let imageUrl = existing_image;

    // ✅ if new file, store only relative path
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const sql = `
      UPDATE dashboard_schemes 
      SET image_url = ?, 
          about_scheme_en = ?, 
          about_scheme_ta = ?, 
          preferred_species_en = ?, 
          preferred_species_ta = ? 
      WHERE id = ?
    `;

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

// --- 7. Delete Dashboard Scheme ---
exports.deleteDashboardScheme = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    const sql = "DELETE FROM dashboard_schemes WHERE id = ?";
    await db.query(sql, [id]);

    res.json({ message: "Scheme deleted successfully" });

  } catch (error) {
    console.error("Delete Scheme Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};