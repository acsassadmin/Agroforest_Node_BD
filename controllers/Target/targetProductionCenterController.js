const db = require('../../db');
const jwt = require('jsonwebtoken');

// ===================== CREATE =====================


exports.createTargetProductionCenter = async (req, res) => {
    try {
        const { target_department_id, district_id, block_id, productioncenter_id, 
                target_quantity, start_date, end_date, created_by, scheme_type, scheme_id } = req.body;

        // Basic validation
        if (!district_id || !block_id || !productioncenter_id || !target_quantity || !start_date || !end_date || !created_by) {
            return res.status(400).json({ message: "Required fields missing" });
        }

        // Validate Scheme ID if type is "Scheme"
        const finalSchemeId = scheme_type === "Scheme" ? scheme_id : null;
        if (scheme_type === "Scheme" && !finalSchemeId) {
            return res.status(400).json({ message: "Scheme ID is required when Scheme type is selected" });
        }

        // Check if district, block, and PC exist (Optional but good for integrity)
        const [pc] = await db.query(`SELECT id FROM productioncenter_productioncenter WHERE id = ?`, [productioncenter_id]);
        if (pc.length === 0) return res.status(400).json({ message: "Invalid productioncenter_id" });

        // ===================== UPDATED DUPLICATE LOGIC =====================
        // We check: Same PC + Same Scheme (or NULL) + Same Start Date
        // This allows the same nursery to have targets for DIFFERENT schemes in the same year.
        const [existing] = await db.query(
            `SELECT id FROM target_productioncenter
             WHERE productioncenter_id = ? 
             AND scheme_id <=> ? 
             AND start_date = ?`,
            [productioncenter_id, finalSchemeId, start_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this production center and selected scheme for this period" });
        }
        // ===================================================================

        const [result] = await db.query(
            `INSERT INTO target_productioncenter 
             (target_department_id, district_id, block_id, productioncenter_id, target_quantity, start_date, end_date, created_by, scheme_type, scheme_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [target_department_id || null, district_id, block_id, productioncenter_id, target_quantity, start_date, end_date, created_by, scheme_type || "Non-Scheme", finalSchemeId]
        );

        res.status(201).json({ message: "Target created successfully", target_id: result.insertId });
    } catch (err) {
        console.error("Create Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL =====================
exports.getAllTargetProductionCenters = async (req, res) => {
    try {
        // Get user_id from query params
        const userId = req.query.user_id;

        if (!userId) {
            return res.status(400).json({ message: "user_id is required in query params" });
        }

        // 1. Fetch User Info to determine role and permissions
        const [userRow] = await db.query(
            `SELECT u.id, u.district_id, u.block_id, u.department_id, ur.name AS role_name, 
                    d.District_Name, b.Block_Name, dept.name AS department_name, u.is_superuser 
             FROM users_customuser u 
             LEFT JOIN master_district d ON u.district_id = d.id 
             LEFT JOIN master_block b ON u.block_id = b.id
             LEFT JOIN department dept ON u.department_id = dept.id
             LEFT JOIN users_role ur ON u.role_id = ur.id
             WHERE u.id = ?`, 
            [userId]
        );
        
        if (userRow.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        
        const { 
            id: fetchedUserId, 
            district_id, 
            block_id, 
            department_id, 
            role_name, 
            District_Name, 
            Block_Name, 
            department_name, 
            is_superuser 
        } = userRow[0];

        // 2. Setup Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 3. Build Filter based on Role
        let conditions = [];
        let params = [];

        // Role-based filtering logic
        if (role_name === 'superadmin' || is_superuser) {
            // Superadmin sees EVERYTHING - no conditions added
        } else if (role_name === 'department_admin') {
            if (department_id) {
                conditions.push("tpc.target_department_id = ?");
                params.push(department_id);
            }
        } else if (role_name === 'district_admin') {
            // District admin sees only their district data
            if (district_id) {
                conditions.push("tpc.district_id = ?");
                params.push(district_id);
            }
        } else if (role_name === 'block_admin') {
            // Block admin sees only their block data
            if (block_id) {
                conditions.push("tpc.block_id = ?");
                params.push(block_id);
            }
        } else {
            // For any other role, default to their block/district if available
            if (block_id) {
                conditions.push("tpc.block_id = ?");
                params.push(block_id);
            } else if (district_id) {
                conditions.push("tpc.district_id = ?");
                params.push(district_id);
            }
        }

        let whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

        // 4. Main Query
        let dataQuery = `
            SELECT 
                tpc.*, 
                md.District_Name AS district_name, 
                blk.Block_Name AS block_name,
                pc.name_of_production_centre AS productioncenter_name,
                s.name AS scheme_name,
                dept.name AS department_name
            FROM target_productioncenter tpc
            LEFT JOIN master_district md ON tpc.district_id = md.id
            LEFT JOIN master_block blk ON tpc.block_id = blk.id
            LEFT JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
            LEFT JOIN tn_schema s ON tpc.scheme_id = s.id
            LEFT JOIN department dept ON tpc.target_department_id = dept.id
            ${whereClause}
            ORDER BY tpc.id DESC 
            LIMIT ? OFFSET ?
        `;

        const [rows] = await db.query(dataQuery, [...params, limit, offset]);
        
        // 5. Get Total for pagination
        const [countRows] = await db.query(
            `SELECT COUNT(*) as total FROM target_productioncenter tpc ${whereClause}`, 
            params
        );
        const total = countRows[0].total;

        // 6. Fetch Block Allocations (Pool logic) - Only for block_admin
        let blockAllocations = [];
        if (role_name === 'block_admin' && block_id) {
            const [allocRes] = await db.query(
                `SELECT 
                    tb.id, 
                    tb.scheme_type, 
                    tb.scheme_id, 
                    tb.target_quantity,
                    s.name as scheme_name
                 FROM target_block tb
                 LEFT JOIN tn_schema s ON tb.scheme_id = s.id
                 WHERE tb.block_id = ?`, 
                [block_id]
            );
            blockAllocations = allocRes;
        }

        // 7. Determine display names based on role
        let user_district_name = "All Districts";
        let user_block_name = "All Blocks";
        let user_department_name = "All Departments";

        if (role_name === 'superadmin' || is_superuser) {
            user_district_name = "All Districts";
            user_block_name = "All Blocks";
            user_department_name = "All Departments";
        } else if (role_name === 'department_admin') {
            user_department_name = department_name || "N/A";
        } else if (role_name === 'district_admin') {
            user_district_name = District_Name || "N/A";
        } else if (role_name === 'block_admin') {
            user_district_name = District_Name || "N/A";
            user_block_name = Block_Name || "N/A";
        }

        // 8. Return Response
        res.status(200).json({
            user_id: fetchedUserId,
            user_role: role_name,
            data: rows,
            pagination: { 
                total, 
                page, 
                limit, 
                totalPages: Math.ceil(total / limit) 
            },
            block_allocations: blockAllocations,
            user_info: {
                user_district_name,
                user_block_name,
                user_department_name
            }
        });

    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ error: err.message });
    }
};


// ===================== GET PRODUCTION CENTERS BY BLOCK =====================
exports.getProductionCentersByBlock = async (req, res) => {
    try {
        const { block_id } = req.query;
        // Logic: Fetch nurseries for the specific block
        const [rows] = await db.query(
            `SELECT id, name_of_production_centre AS name 
             FROM productioncenter_productioncenter 
             WHERE block_id = ? AND status = 'approved'`, 
            [block_id]
        );
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET BY ID =====================
exports.getTargetProductionCenterById = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT tpc.*, md.District_Name AS district_name, blk.Block_Name AS block_name,
                    pc.name_of_production_centre AS productioncenter_name, s.name AS scheme_name
             FROM target_productioncenter tpc
             LEFT JOIN master_district md ON tpc.district_id = md.id
             LEFT JOIN master_block blk ON tpc.block_id = blk.id
             LEFT JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
             LEFT JOIN tn_schema s ON tpc.scheme_id = s.id
             WHERE tpc.id = ?`, [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Target not found" });
        res.status(200).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ===================== UPDATE =====================
exports.updateTargetProductionCenter = async (req, res) => {
    try {
        const { target_department_id, district_id, block_id, productioncenter_id, 
                target_quantity, start_date, end_date, scheme_type = "Non-Scheme", scheme_id = null } = req.body;

        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required for Scheme type" });
        }

        await db.query(
            `UPDATE target_productioncenter
             SET target_department_id = ?, district_id = ?, block_id = ?, productioncenter_id = ?, 
                 target_quantity = ?, start_date = ?, end_date = ?, scheme_type = ?, scheme_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [target_department_id, district_id, block_id, productioncenter_id, target_quantity, start_date, end_date, scheme_type, scheme_id, req.params.id]
        );
        res.status(200).json({ message: "Target updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ===================== DELETE =====================
exports.deleteTargetProductionCenter = async (req, res) => {
    try {
        await db.query(`DELETE FROM target_productioncenter WHERE id = ?`, [req.params.id]);
        res.status(200).json({ message: "Target deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};