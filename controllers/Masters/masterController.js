const db = require("../../db");

// 1. Get Blocks
exports.getBlocks = async (req, res) => {
  try {
    const { district_id } = req.query;

    let query = `SELECT id, Block_Name, Dist_Name FROM master_block`;
    let params = [];

    if (district_id) {
      query += ` WHERE Dist_Name = ?`;
      params.push(district_id);
    }

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

    let query = `SELECT id, Village_Name, Block FROM master_village`;
    let params = [];

    if (block_id) {
      query += ` WHERE Block = ?`;
      params.push(block_id);
    }

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
    const query = `SELECT id, District_Name FROM master_district ORDER BY District_Name ASC`;
    const [rows] = await db.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching districts:", err);
    res.status(500).json({ error: err.message });
  }
};