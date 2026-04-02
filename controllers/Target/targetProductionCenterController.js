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
// ===================== GET ALL =====================
exports.getAllTargetProductionCenters = async (req, res) => {
    try {
        // 1. DEFINE VARIABLES AT THE TOP LEVEL OF THE FUNCTION
        let uBlockId = null;
        let uDistId = null;
        let userId = null;

        // 2. Extract User ID from Token
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.decode(token); 
            userId = decoded?.id || decoded?.userId;
        }

        // 3. Fetch user permissions if userId exists
        if (userId) {
            const [userRow] = await db.query(
                `SELECT district_id, block_id FROM users_customuser WHERE id = ?`, 
                [userId]
            );
            if (userRow.length > 0) {
                uDistId = userRow[0].district_id;
                uBlockId = userRow[0].block_id;
            }
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 4. Build Conditions Array
        let conditions = [];
        let params = [];

        if (uBlockId) {
            conditions.push("tpc.block_id = ?");
            params.push(uBlockId);
        } else if (uDistId) {
            conditions.push("tpc.district_id = ?");
            params.push(uDistId);
        }

        let whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

        // 5. Get Total Count
        const [countRows] = await db.query(
            `SELECT COUNT(*) as total FROM target_productioncenter tpc ${whereClause}`, 
            params
        );
        const total = countRows[0]?.total || 0;

        // 6. Main Data Query (Use LEFT JOINs so Non-Scheme data shows up)
        let dataQuery = `
    SELECT 
        tpc.*, 
        md.District_Name AS district_name, 
        blk.Block_Name AS block_name,
        pc.name_of_production_centre AS productioncenter_name,
        s.name AS scheme_name
    FROM target_productioncenter tpc
    LEFT JOIN master_district md ON tpc.district_id = md.id
    LEFT JOIN master_block blk ON tpc.block_id = blk.id
    LEFT JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
    LEFT JOIN tn_schema s ON tpc.scheme_id = s.id
    ${whereClause}
    ORDER BY tpc.id DESC 
    LIMIT ? OFFSET ?
`;

        const finalParams = [...params, limit, offset];
        const [rows] = await db.query(dataQuery, finalParams);

        // 7. Prepare Response
        const responsePayload = {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };

        // 8. Add District/Block Names for Frontend Headers
        if (uDistId || uBlockId) {
            const [names] = await db.query(
                `SELECT 
                    (SELECT District_Name FROM master_district WHERE id = ?) as dName,
                    (SELECT Block_Name FROM master_block WHERE id = ?) as bName`,
                [uDistId, uBlockId]
            );
            responsePayload.user_district_name = names[0]?.dName || "Unknown District";
            responsePayload.user_block_name = names[0]?.bName || "Unknown Block";
        }

        res.status(200).json(responsePayload);

    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ error: err.message });
    }
};
// ===================== GET PRODUCTION CENTERS BY BLOCK =====================
exports.getProductionCentersByBlock = async (req, res) => {
    try {
        const { block_id } = req.query;
        if (!block_id) return res.status(400).json({ message: "block_id is required" });

        const [rows] = await db.query(
            `SELECT id, name_of_production_centre AS name FROM productioncenter_productioncenter WHERE block_id = ?`, 
            [block_id]
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Fetch Centers Error:", err);
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