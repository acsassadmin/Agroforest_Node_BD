const db = require('../../db');
const jwt = require('jsonwebtoken');

// Helper to get User ID from req or token
const getUserId = (req) => {
    if (req.user?.id) return req.user.id;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token);
        return decoded?.id || decoded?.userId;
    }
    return null;
};

// ===================== CREATE TARGET BLOCK =====================
exports.createTargetBlock = async (req, res) => {
    try {
        const userId = req.user.id;
        const [userRow] = await db.query(
            `SELECT district_id FROM users_customuser WHERE id = ?`, 
            [userId]
        );

        if (userRow.length === 0) return res.status(404).json({ message: "User not found" });
        const { district_id } = userRow[0];

        const { block_id, target_quantity, start_date, end_date, scheme_type, scheme_id } = req.body;

        // --- NEW: DUPLICATE CHECK LOGIC ---
        const [existing] = await db.query(
            `SELECT id FROM target_block 
             WHERE block_id = ? 
             AND start_date = ? 
             AND scheme_type = ? 
             AND (scheme_id = ? OR (scheme_id IS NULL AND ? IS NULL))`,
            [block_id, start_date, scheme_type, scheme_id, scheme_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({ 
                message: "A target for this block and scheme already exists for this period." 
            });
        }
        // --- END OF CHECK ---

        await db.query(
            `INSERT INTO target_block (district_id, block_id, target_quantity, start_date, end_date, scheme_type, scheme_id, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [district_id, block_id, target_quantity, start_date, end_date, scheme_type, scheme_id, userId]
        );

        res.status(201).json({ message: "Created successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
// controllers/Target/targetBlockController.js

exports.getAllTargetBlocks = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 1. Get User Info
        const [userRow] = await db.query(
            `SELECT u.district_id, u.department_id, d.District_Name 
             FROM users_customuser u 
             LEFT JOIN master_district d ON u.district_id = d.id 
             WHERE u.id = ?`, 
            [userId]
        );
        
        if (userRow.length === 0) return res.status(404).json({ message: "User not found" });
        
        const uDistId = userRow[0].district_id;
        const uDeptId = userRow[0].department_id;
        const uDistName = userRow[0].District_Name;

        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token);
        const userRole = decoded?.role || "district_admin";

        // 2. The Main Query
        // Using LEFT JOIN ensures that even if a department is missing, the Block Target still shows up.
      const dataQuery = `
    SELECT 
        tb.*, 
        IFNULL(dept.name, 'General') AS department_name, 
        b.Block_Name AS block_name, 
        d.District_Name AS district_name, 
        s.name AS scheme_name
    FROM target_block tb
    -- ✅ FIX: Handle NULLs or mismatched IDs in the JOIN condition
    LEFT JOIN department dept ON IFNULL(tb.target_department_id, 0) = IFNULL(dept.id, 0)
    LEFT JOIN master_block b ON tb.block_id = b.id
    LEFT JOIN master_district d ON tb.district_id = d.id
    LEFT JOIN tn_schema s ON tb.scheme_id = s.id
`;

        let rows = [];
        let districtAllocations = [];

        if (userRole === 'superadmin') {
            const [allocRes] = await db.query(`SELECT * FROM target_district`);
            districtAllocations = allocRes;
            
            const [dataRes] = await db.query(`${dataQuery} ORDER BY tb.id DESC`);
            rows = dataRes;
        } else {
            // Get allocations for this district
            const [allocRes] = await db.query(
                `SELECT * FROM target_district WHERE district_id = ?`, 
                [uDistId]
            );
            districtAllocations = allocRes;
            
            // ✅ THE FIX: Ensure your WHERE clause matches how data was saved
            // If you previously saved data without a department_id, filtering by uDeptId will return 0 rows.
            const [dataRes] = await db.query(
                `${dataQuery} WHERE tb.district_id = ? ORDER BY tb.id DESC`, 
                [uDistId]
            );
            rows = dataRes;
        }

        // 3. Final Response
        res.status(200).json({
            success: true,
            data: rows || [],
            district_allocations: districtAllocations || [],
            user_district_id: uDistId,
            user_district_name: uDistName || "All Districts"
        });

    } catch (err) {
        console.error("GET ALL ERROR:", err);
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
            scheme_type, 
            scheme_id,
            district_id 
        } = req.body;

        // 🔍 Log the body to see what is arriving
        console.log("Updating ID:", id, "with data:", req.body);

        const [result] = await db.query(
            `UPDATE target_block 
             SET block_id = ?, target_quantity = ?, start_date = ?, 
                 end_date = ?, scheme_type = ?, scheme_id = ?, district_id = ?
             WHERE id = ?`,
            [block_id, target_quantity, start_date, end_date, scheme_type, scheme_id, district_id, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.status(200).json({ message: "Updated successfully" });
    } catch (err) {
        console.error("UPDATE ERROR:", err);
        
        // Handle Foreign Key Error specifically
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(500).json({ 
                message: "Cannot edit/delete: This block is already linked to Panchayat targets or Reports." 
            });
        }

        res.status(500).json({ error: err.message });
    }
};

// ===================== DELETE TARGET BLOCK =====================
// controllers/Target/targetBlockController.js

exports.deleteTargetBlock = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ message: "ID is required" });
        }

        const [result] = await db.query(`DELETE FROM target_block WHERE id = ?`, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.status(200).json({ message: "Deleted successfully" });
    } catch (err) {
        console.error("DELETE ERROR:", err);
        // Check if it's a foreign key error (Error Code 1451)
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(500).json({ 
                message: "Cannot delete: This block target is linked to other records (Panchayats/Reports)." 
            });
        }
        res.status(500).json({ error: err.message });
    }
};