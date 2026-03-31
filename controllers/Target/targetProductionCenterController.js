const db = require('../../db');
const jwt = require('jsonwebtoken');

// ===================== CREATE =====================
exports.createTargetProductionCenter = async (req, res) => {
    try {
        const { target_department_id, district_id, block_id, productioncenter_id, 
                target_quantity, start_date, end_date, created_by, scheme_type, scheme_id } = req.body;

        if (!district_id || !block_id || !productioncenter_id || !target_quantity || !start_date || !end_date || !created_by) {
            return res.status(400).json({ message: "District, Block, Production Center, Quantity, Dates, and Creator are required" });
        }
        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required when Scheme type is selected" });
        }

        const [dist] = await db.query(`SELECT id FROM master_district WHERE id = ?`, [district_id]);
        if (dist.length === 0) return res.status(400).json({ message: "Invalid district_id" });

        const [blk] = await db.query(`SELECT id FROM master_block WHERE id = ?`, [block_id]);
        if (blk.length === 0) return res.status(400).json({ message: "Invalid block_id" });

        const [pc] = await db.query(`SELECT id FROM productioncenter_productioncenter WHERE id = ?`, [productioncenter_id]);
        if (pc.length === 0) return res.status(400).json({ message: "Invalid productioncenter_id" });

        const [existing] = await db.query(
            `SELECT * FROM target_productioncenter
             WHERE target_department_id <=> ? AND district_id = ? AND block_id = ? AND productioncenter_id = ? 
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [target_department_id || null, district_id, block_id, productioncenter_id, start_date, end_date]
        );
        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this production center in this date range" });
        }

        const [result] = await db.query(
            `INSERT INTO target_productioncenter 
             (target_department_id, district_id, block_id, productioncenter_id, target_quantity, start_date, end_date, created_by, scheme_type, scheme_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [target_department_id || null, district_id, block_id, productioncenter_id, target_quantity, start_date, end_date, created_by, scheme_type || "Non-Scheme", scheme_id || null]
        );

        res.status(201).json({ message: "Target Production Center created successfully", target_id: result.insertId });
    } catch (err) {
        console.error("Create Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL =====================
exports.getAllTargetProductionCenters = async (req, res) => {
    try {
        let uBlockId = null;
        let uDistId = null;
        let userId = null;

        if (req.user) {
            userId = req.user.id;
        } else {
            try {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.split(' ')[1];
                    const decoded = jwt.decode(token); 
                    userId = decoded?.id || decoded?.userId;
                }
            } catch (decodeErr) {
                console.error("JWT Decode Error:", decodeErr.message);
            }
        }

        if (userId) {
            try {
                const [userRow] = await db.query(`SELECT district_id, block_id FROM users_customuser WHERE id = ?`, [userId]);
                if (userRow.length > 0) {
                    uDistId = userRow[0].district_id;
                    uBlockId = userRow[0].block_id;
                }
            } catch (dbErr) {
                console.error("DB Fetch Error:", dbErr.message);
            }
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        let countQuery = `SELECT COUNT(*) as total FROM target_productioncenter tpc`;
        let dataQuery = `
            SELECT tpc.*, tpc.scheme_type, td.id AS target_dept_id, 
                   md.District_Name AS district_name, blk.Block_Name AS block_name,
                   pc.name_of_production_centre AS productioncenter_name,
                   uc.username AS created_by_name, s.name AS scheme_name
             FROM target_productioncenter tpc
             LEFT JOIN target_department td ON tpc.target_department_id = td.id  
             LEFT JOIN master_district md ON tpc.district_id = md.id
             LEFT JOIN master_block blk ON tpc.block_id = blk.id
             JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
             LEFT JOIN users_customuser uc ON tpc.created_by = uc.id
             LEFT JOIN tn_schema s ON tpc.scheme_id = s.id
        `;

        const params = [];
        const countParams = [];
        let conditions = [];

        if (uBlockId) {
            conditions.push("tpc.block_id = ?");
            params.push(uBlockId);
            countParams.push(uBlockId);
        } else {
            if (req.query.district_id) {
                conditions.push("tpc.district_id = ?");
                params.push(req.query.district_id);
                countParams.push(req.query.district_id);
            }
            if (req.query.block_id) {
                conditions.push("tpc.block_id = ?");
                params.push(req.query.block_id);
                countParams.push(req.query.block_id);
            }
        }

        if (conditions.length > 0) {
            const whereClause = " WHERE " + conditions.join(" AND ");
            dataQuery += whereClause;
            countQuery += " WHERE " + conditions.join(" AND ");
        }

        const [countRows] = await db.query(countQuery, countParams);
        const total = countRows[0].total;

        dataQuery += " ORDER BY tpc.id DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const [rows] = await db.query(dataQuery, params);

        const responsePayload = {
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };

        if (uBlockId || uDistId) {
            responsePayload.user_block_id = uBlockId;
            responsePayload.user_district_id = uDistId;

            try {
                let districtName = "Unknown District";
                let blockName = "Unknown Block";

                if (uDistId) {
                    const [distInfo] = await db.query(`SELECT District_Name FROM master_district WHERE id = ?`, [uDistId]);
                    if (distInfo.length > 0) districtName = distInfo[0].District_Name || districtName;
                }
                if (uBlockId) {
                    const [blkInfo] = await db.query(`SELECT Block_Name FROM master_block WHERE id = ?`, [uBlockId]);
                    if (blkInfo.length > 0) blockName = blkInfo[0].Block_Name || blockName;
                }

                responsePayload.user_district_name = districtName;
                responsePayload.user_block_name = blockName;
            } catch (nameErr) {
                responsePayload.user_district_name = `District ID: ${uDistId}`;
                responsePayload.user_block_name = `Block ID: ${uBlockId}`;
            }
        }

        res.status(200).json(responsePayload);
    } catch (err) {
        console.error("Get All Error:", err);
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