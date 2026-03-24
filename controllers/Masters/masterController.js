// controllers/masterController.js
const db = require("../../db");
// 1. Get Blocks
exports.getBlocks = async (req, res) => {
  try {
    const { district_id } = req.query;

    let query = `SELECT id, Block_Name FROM master_block`;
    let params = [];

    // ✅ Filter by district_id if provided
    if (district_id) {
      query += ` WHERE District_Id = ?`;
      params.push(district_id);
    }

    // ✅ Sort by Block_Name
    query += ` ORDER BY Block_Name ASC`;

    const [rows] = await db.query(query, params);

    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching blocks:", err);
    res.status(500).json({ error: err.message });
  }
};

// 2. Get Villages
exports.getVillages = async (req, res) => {
  try {
    const { block_id } = req.query;

    let query = `SELECT id, Village_Name FROM master_village`;
    let params = [];

    // ✅ Filter by block_id if provided
    if (block_id) {
      query += ` WHERE Block_Id = ?`;
      params.push(block_id);
    }

    // ✅ Sort by Village_Name
    query += ` ORDER BY Village_Name ASC`;

    const [rows] = await db.query(query, params);

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