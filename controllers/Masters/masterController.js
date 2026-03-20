// controllers/masterController.js
const db = require("../../db");
// 1. Get Blocks
exports.getBlocks = async (req, res) => {
  try {
    // Selecting ID is recommended for frontend dropdowns
    const query = `SELECT id, Block_Name FROM master_block`;
    
    const [rows] = await db.query(query);
    
    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching blocks:", err);
    res.status(500).json({ error: err.message });
  }
};

// 2. Get Villages
exports.getVillages = async (req, res) => {
  try {
    const query = `SELECT id, Village_Name FROM master_village`;
    
    const [rows] = await db.query(query);
    
    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching villages:", err);
    res.status(500).json({ error: err.message });
  }
};

// 3. Get Districts
exports.getDistricts = async (req, res) => {
  try {
    const query = `SELECT id, District_Name FROM master_district`;
    
    const [rows] = await db.query(query);
    
    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching districts:", err);
    res.status(500).json({ error: err.message });
  }
};