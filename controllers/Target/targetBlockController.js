const db = require('../../db');

// ===================== CREATE TARGET BLOCK =====================
exports.createTargetBlock = async (req, res) => {
  try {
    const { 
      target_department_id, 
      district_id, 
      block_id, 
      target_quantity, 
      start_date, 
      end_date, 
      created_by,
      scheme_type,   // NEW: "Scheme" or "Non-Scheme"
      scheme_id      // NEW: ID or null
    } = req.body;

    // 1. Basic Validation
    if (!district_id || !block_id || !target_quantity || !start_date || !end_date || !created_by) {
      return res.status(400).json({ message: "District, Block, Quantity, Dates, and User are required" });
    }

    // 2. Scheme Logic Validation
    if (scheme_type === "Scheme" && !scheme_id) {
      return res.status(400).json({ message: "Scheme ID is required when Scheme type is selected" });
    }

    // 3. Check if block exists
    const [blk] = await db.query(`SELECT id FROM master_block WHERE id = ?`, [block_id]);
    if (blk.length === 0) {
      return res.status(400).json({ message: "Invalid Block ID" });
    }

    // 4. Check for existing target (Date overlap check)
    const [existing] = await db.query(
      `SELECT * FROM target_block 
       WHERE district_id = ? AND block_id = ? 
       AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
      [district_id, block_id, start_date, end_date]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Target already exists for this block and date range" });
    }

    // 5. Insert Data
    await db.query(
      `INSERT INTO target_block 
      (target_department_id, district_id, block_id, target_quantity, start_date, end_date, created_by, scheme_type, scheme_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        target_department_id || null, 
        district_id, 
        block_id, 
        target_quantity, 
        start_date, 
        end_date, 
        created_by, 
        scheme_type || "Non-Scheme", // Default to Non-Scheme
        scheme_id || null            // Ensure null if undefined
      ]
    );

    res.status(201).json({ message: "Target Block created successfully" });
  } catch (err) {
    console.error("Create Target Block Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===================== GET ALL TARGET BLOCKS =====================
exports.getAllTargetBlocks = async (req, res) => {
  try {
    const { district_id } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Count Query
    let countQuery = `SELECT COUNT(*) as total FROM target_block tb`;
    const countParams = [];

    // Data Query - Added scheme_type and JOIN with tn_schema
    let dataQuery = `
      SELECT 
        tb.id,
        tb.target_department_id,
        tb.district_id,
        tb.block_id,
        tb.target_quantity,
        tb.start_date,
        tb.end_date,
        tb.scheme_type, /* ADDED */
        td.department_id AS department_ref,
        md.District_Name AS district_name,
        blk.Block_Name AS block_name,
        uc.username AS created_by_name,
        s.name AS scheme_name,
        s.percentage AS scheme_percentage
      FROM target_block tb
      LEFT JOIN target_department td ON tb.target_department_id = td.id
      LEFT JOIN master_district md ON tb.district_id = md.id
      LEFT JOIN master_block blk ON tb.block_id = blk.id
      LEFT JOIN users_customuser uc ON tb.created_by = uc.id
      LEFT JOIN tn_schema s ON tb.scheme_id = s.id /* ADDED */
    `;
    const params = [];

    // Optional district filter
    if (district_id) {
      dataQuery += ` WHERE tb.district_id = ?`;
      countQuery += ` WHERE tb.district_id = ?`;
      params.push(district_id);
      countParams.push(district_id);
    }

    // Count total
    const [countRows] = await db.query(countQuery, countParams);
    const total = countRows[0].total;

    // Pagination
    dataQuery += ` ORDER BY tb.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Fetch data
    const [rows] = await db.query(dataQuery, params);

    res.status(200).json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get All Target Blocks Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===================== GET TARGET BLOCK BY ID =====================
exports.getTargetBlockById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [rows] = await db.query(
            `SELECT tb.*, 
                    md.District_Name AS district_name,
                    blk.Block_Name AS block_name,
                    uc.username AS created_by_name,
                    s.name AS scheme_name
             FROM target_block tb
             LEFT JOIN master_district md ON tb.district_id = md.id
             LEFT JOIN master_block blk ON tb.block_id = blk.id
             LEFT JOIN users_customuser uc ON tb.created_by = uc.id
             LEFT JOIN tn_schema s ON tb.scheme_id = s.id
             WHERE tb.id = ?`, 
             [id]
        );

        if (rows.length === 0) return res.status(404).json({ message: "Target Block not found" });
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Get Target Block By ID Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== UPDATE TARGET BLOCK =====================
exports.updateTargetBlock = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
          target_department_id, 
          district_id, 
          block_id, 
          target_quantity, 
          start_date, 
          end_date,
          scheme_type = "Non-Scheme", // Added
          scheme_id = null            // Added
        } = req.body;

        // Validation
        if (!district_id || !block_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        
        // Scheme Validation
        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required for Scheme type" });
        }

        const [dist] = await db.query(`SELECT id FROM master_district WHERE id = ?`, [district_id]);
        if (dist.length === 0) return res.status(400).json({ message: "Invalid district_id" });

        const [blk] = await db.query(`SELECT id FROM master_block WHERE id = ?`, [block_id]);
        if (blk.length === 0) return res.status(400).json({ message: "Invalid block_id" });

        await db.query(
            `UPDATE target_block 
             SET target_department_id = ?, district_id = ?, block_id = ?, target_quantity = ?, 
                 start_date = ?, end_date = ?, scheme_type = ?, scheme_id = ?
             WHERE id = ?`,
            [
              target_department_id || null, 
              district_id, 
              block_id, 
              target_quantity, 
              start_date, 
              end_date, 
              scheme_type, 
              scheme_id, 
              id
            ]
        );

        res.status(200).json({ message: "Target Block updated successfully" });
    } catch (err) {
        console.error("Update Target Block Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== DELETE TARGET BLOCK =====================
exports.deleteTargetBlock = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`DELETE FROM target_block WHERE id = ?`, [id]);
        res.status(200).json({ message: "Target Block deleted successfully" });
    } catch (err) {
        console.error("Delete Target Block Error:", err);
        res.status(500).json({ error: err.message });
    } 
};