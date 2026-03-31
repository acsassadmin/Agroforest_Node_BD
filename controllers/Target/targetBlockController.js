
const db = require('../../db');

// ===================== SECURITY HELPERS =====================
const getAuthUserDistrictId = (req) => req.user?.district_id || null;
const getAuthUserDeptId = (req) => req.user?.department_id || null;
const getAuthUserId = (req) => req.user?.id || null;

const isDistrictAdmin = (req) => req.user?.role === 'district_admin';
const isSuperAdmin = (req) => {
  const role = req.user?.role;
  return role === 'super_admin' || role === 'admin';
};
// =============================================================



// ===================== CREATE TARGET BLOCK =====================
exports.createTargetBlock = async (req, res) => {
  try {
    // ✅ QUICK FIX: Fetch from DB if token is missing it
    if (req.user && !req.user.district_id && req.user.id) {
      const [userRow] = await db.query(`SELECT district_id, department_id, block_id FROM users_customuser WHERE id = ?`, [req.user.id]);
      if (userRow.length > 0) {
        req.user.district_id = userRow[0].district_id;
        req.user.department_id = userRow[0].department_id;
        req.user.block_id = userRow[0].block_id;
      }
    }

    const { 
      block_id, 
      target_quantity, 
      start_date, 
      end_date,
      scheme_type,   
      scheme_id      
    } = req.body;

    // ✅ SECURITY: Force IDs from token
    let district_id = getAuthUserDistrictId(req);
    let target_department_id = getAuthUserDeptId(req);
    let created_by = getAuthUserId(req);

    if (isSuperAdmin(req)) {
      if (req.body.district_id) district_id = req.body.district_id;
      if (req.body.target_department_id) target_department_id = req.body.target_department_id;
      if (req.body.created_by) created_by = req.body.created_by;
    }

    if (!district_id) {
      return res.status(403).json({ message: "Access denied: Cannot determine your district" });
    }

    // 1. Basic Validation
    if (!block_id || !target_quantity || !start_date || !end_date) {
      return res.status(400).json({ message: "Block, Quantity, and Dates are required" });
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
        scheme_type || "Non-Scheme", 
        scheme_id || null
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
    // ✅ QUICK FIX: Fetch from DB if token is missing it
    if (req.user && !req.user.district_id && req.user.id) {
      const [userRow] = await db.query(`SELECT district_id, department_id, block_id FROM users_customuser WHERE id = ?`, [req.user.id]);
      if (userRow.length > 0) {
        req.user.district_id = userRow[0].district_id;
        req.user.department_id = userRow[0].department_id;
        req.user.block_id = userRow[0].block_id;
      }
    }

    // ✅ TEMPORARY DEBUG LOG
    console.log("=== BLOCK GET ALL REQ.USER ===", req.user);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // ✅ SECURITY: Auto-filter based on role (Exact same logic as District)
    let district_id = null;
    
    if (isDistrictAdmin(req)) {
      district_id = getAuthUserDistrictId(req);
      if (!district_id) {
        return res.status(403).json({ message: "Access denied: Cannot determine your district" });
      }
    } else if (isSuperAdmin(req)) {
      district_id = req.query.district_id || null; // Super admin can see all or filter
    } else {
      district_id = req.query.district_id || null;
    }

    // Count Query
    let countQuery = `SELECT COUNT(*) as total FROM target_block tb`;
    const countParams = [];

    // Data Query
    let dataQuery = `
      SELECT 
        tb.id,
        tb.target_department_id,
        tb.district_id,
        tb.block_id,
        tb.target_quantity,
        tb.start_date,
        tb.end_date,
        tb.scheme_type, 
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
      LEFT JOIN tn_schema s ON tb.scheme_id = s.id 
    `;
    const params = [];

    if (district_id) {
      dataQuery += ` WHERE tb.district_id = ?`;
      countQuery += ` WHERE tb.district_id = ?`;
      params.push(district_id);
      countParams.push(district_id);
    }

    const [countRows] = await db.query(countQuery, countParams);
    const total = countRows[0].total;

    dataQuery += ` ORDER BY tb.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

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

        // ✅ SECURITY: Ownership check
        if (isDistrictAdmin(req)) {
          const userDistId = getAuthUserDistrictId(req);
          if (String(rows[0].district_id) !== String(userDistId)) {
            return res.status(403).json({ message: "Access denied: You can only view your district's targets" });
          }
        }

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
          block_id, 
          target_quantity, 
          start_date, 
          end_date,
          scheme_type = "Non-Scheme", 
          scheme_id = null
        } = req.body;

        // ✅ SECURITY: Force IDs from token
        let district_id = getAuthUserDistrictId(req);
        let target_department_id = getAuthUserDeptId(req);

        if (isSuperAdmin(req)) {
          if (req.body.district_id) district_id = req.body.district_id;
          if (req.body.target_department_id) target_department_id = req.body.target_department_id;
        }

        if (!district_id) {
          return res.status(403).json({ message: "Access denied: Cannot determine your district" });
        }

        // Validation
        if (!block_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        
        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required for Scheme type" });
        }

        // ✅ SECURITY: Verify ownership before updating
        const [existingRecord] = await db.query(`SELECT * FROM target_block WHERE id = ?`, [id]);
        if (existingRecord.length === 0) return res.status(404).json({ message: "Target Block not found" });

        if (isDistrictAdmin(req)) {
          if (String(existingRecord[0].district_id) !== String(district_id)) {
            return res.status(403).json({ message: "Access denied: You can only update your district's targets" });
          }
        }

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

        // ✅ SECURITY: Verify ownership before delete
        const [existingRecord] = await db.query(`SELECT * FROM target_block WHERE id = ?`, [id]);
        if (existingRecord.length === 0) {
          return res.status(404).json({ message: "Target Block not found" });
        }

        if (isDistrictAdmin(req)) {
          const userDistId = getAuthUserDistrictId(req);
          if (String(existingRecord[0].district_id) !== String(userDistId)) {
            return res.status(403).json({ message: "Access denied: You can only delete your district's targets" });
          }
        }

        await db.query(`DELETE FROM target_block WHERE id = ?`, [id]);
        res.status(200).json({ message: "Target Block deleted successfully" });
    } catch (err) {
        console.error("Delete Target Block Error:", err);
        res.status(500).json({ error: err.message });
    } 
};