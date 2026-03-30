const db = require('../../db');

// ===================== CREATE TARGET PRODUCTION CENTER =====================
// ===================== CREATE TARGET PRODUCTION CENTER =====================
exports.createTargetProductionCenter = async (req, res) => {
    try {
        const { 
            target_department_id, 
            district_id,        
            block_id,           
            productioncenter_id, 
            target_quantity, 
            start_date, 
            end_date, 
            created_by,
            scheme_type,   // NEW
            scheme_id      // NEW
        } = req.body;

        // FIX: Removed '!target_department_id' from this check
        if (!district_id || !block_id || !productioncenter_id || !target_quantity || !start_date || !end_date || !created_by) {
            return res.status(400).json({ message: "District, Block, Production Center, Quantity, Dates, and Creator are required" });
        }

        // Scheme Logic Validation
        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required when Scheme type is selected" });
        }

        // Check valid IDs
        const [dist] = await db.query(`SELECT id FROM master_district WHERE id = ?`, [district_id]);
        if (dist.length === 0) return res.status(400).json({ message: "Invalid district_id" });

        const [blk] = await db.query(`SELECT id FROM master_block WHERE id = ?`, [block_id]);
        if (blk.length === 0) return res.status(400).json({ message: "Invalid block_id" });

        const [pc] = await db.query(`SELECT id FROM productioncenter_productioncenter WHERE id = ?`, [productioncenter_id]);
        if (pc.length === 0) return res.status(400).json({ message: "Invalid productioncenter_id" });

        // Check for existing target in the same date range
        const [existing] = await db.query(
            `SELECT * FROM target_productioncenter
             WHERE target_department_id <=> ?  -- FIX: Use <=> for safe NULL comparison
             AND district_id = ? 
             AND block_id = ? 
             AND productioncenter_id = ? 
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [target_department_id || null, district_id, block_id, productioncenter_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this production center in this date range" });
        }

        // 3. Insert Data
        const [result] = await db.query(
            `INSERT INTO target_productioncenter 
             (target_department_id, district_id, block_id, productioncenter_id, target_quantity, start_date, end_date, created_by, scheme_type, scheme_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                target_department_id || null, 
                district_id, 
                block_id, 
                productioncenter_id, 
                target_quantity, 
                start_date, 
                end_date, 
                created_by, 
                scheme_type || "Non-Scheme", 
                scheme_id || null
            ]
        );

        res.status(201).json({ message: "Target Production Center created successfully", target_id: result.insertId });

    } catch (err) {
        console.error("Create Target Production Center Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGET PRODUCTION CENTERS =====================
exports.getAllTargetProductionCenters = async (req, res) => {
    try {
        const { district_id, block_id } = req.query;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        let countQuery = `SELECT COUNT(*) as total FROM target_productioncenter tpc`;
        
        // CHANGED: 'JOIN target_department' -> 'LEFT JOIN target_department'
        let dataQuery = `
            SELECT tpc.*, 
                    tpc.scheme_type, 
                    td.id AS target_dept_id, 
                    md.District_Name AS district_name,
                    blk.Block_Name AS block_name,
                    pc.name_of_production_centre AS productioncenter_name,
                    uc.username AS created_by_name,
                    s.name AS scheme_name
             FROM target_productioncenter tpc
             LEFT JOIN target_department td ON tpc.target_department_id = td.id  /* <--- FIX HERE */
             LEFT JOIN master_district md ON tpc.district_id = md.id
             LEFT JOIN master_block blk ON tpc.block_id = blk.id
             JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
             LEFT JOIN users_customuser uc ON tpc.created_by = uc.id
             LEFT JOIN tn_schema s ON tpc.scheme_id = s.id
        `;

        
        const params = [];
        const countParams = [];
        let conditions = [];

        // Filter Logic
        if (district_id) {
            conditions.push("tpc.district_id = ?");
            params.push(district_id);
            countParams.push(district_id);
        }

        if (block_id) {
            conditions.push("tpc.block_id = ?");
            params.push(block_id);
            countParams.push(block_id);
        }

        // Append Conditions if any
        if (conditions.length > 0) {
            const whereClause = " WHERE " + conditions.join(" AND ");
            dataQuery += whereClause;
            countQuery += " WHERE " + conditions.join(" AND ");
        }

        // Count Total
        const [countRows] = await db.query(countQuery, countParams);
        const total = countRows[0].total;

        // Pagination
        dataQuery += " ORDER BY tpc.id DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const [rows] = await db.query(dataQuery, params);

        res.status(200).json({
            data: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error("Get All Target Production Centers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET PRODUCTION CENTER BY ID =====================
exports.getTargetProductionCenterById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Added scheme_type and JOINs
        const [rows] = await db.query(
            `SELECT tpc.*, 
                    tpc.scheme_type,
                    md.District_Name AS district_name,
                    blk.Block_Name AS block_name,
                    pc.name_of_production_centre AS productioncenter_name,
                    uc.username AS created_by_name,
                    s.name AS scheme_name
             FROM target_productioncenter tpc
             LEFT JOIN master_district md ON tpc.district_id = md.id
             LEFT JOIN master_block blk ON tpc.block_id = blk.id
             LEFT JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
             LEFT JOIN users_customuser uc ON tpc.created_by = uc.id
             LEFT JOIN tn_schema s ON tpc.scheme_id = s.id
             WHERE tpc.id = ?`, 
             [id]
        );
        
        if (rows.length === 0) return res.status(404).json({ message: "Target Production Center not found" });
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Get Target Production Center By ID Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== UPDATE TARGET PRODUCTION CENTER =====================
exports.updateTargetProductionCenter = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            target_department_id, 
            district_id, 
            block_id, 
            productioncenter_id, 
            target_quantity, 
            start_date, 
            end_date,
            scheme_type = "Non-Scheme", // NEW
            scheme_id = null            // NEW
        } = req.body;

        // Validation
        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required for Scheme type" });
        }

        // Check valid IDs
        const [dist] = await db.query(`SELECT id FROM master_district WHERE id = ?`, [district_id]);
        if (dist.length === 0) return res.status(400).json({ message: "Invalid district_id" });

        const [blk] = await db.query(`SELECT id FROM master_block WHERE id = ?`, [block_id]);
        if (blk.length === 0) return res.status(400).json({ message: "Invalid block_id" });

        const [pc] = await db.query(`SELECT id FROM productioncenter_productioncenter WHERE id = ?`, [productioncenter_id]);
        if (pc.length === 0) return res.status(400).json({ message: "Invalid productioncenter_id" });

        await db.query(
            `UPDATE target_productioncenter
             SET target_department_id = ?, district_id = ?, block_id = ?, productioncenter_id = ?, 
                 target_quantity = ?, start_date = ?, end_date = ?, scheme_type = ?, scheme_id = ?
             WHERE id = ?`,
            [target_department_id, district_id, block_id, productioncenter_id, target_quantity, start_date, end_date, scheme_type, scheme_id, id]
        );

        res.status(200).json({ message: "Target Production Center updated successfully" });
    } catch (err) {
        console.error("Update Target Production Center Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== DELETE TARGET PRODUCTION CENTER =====================
exports.deleteTargetProductionCenter = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`DELETE FROM target_productioncenter WHERE id = ?`, [id]);
        res.status(200).json({ message: "Target Production Center deleted successfully" });
    } catch (err) {
        console.error("Delete Target Production Center Error:", err);
        res.status(500).json({ error: err.message });
    }
};