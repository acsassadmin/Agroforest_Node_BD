const db = require('../../db');

// ===================== CREATE TARGET PRODUCTION CENTER =====================
exports.createTargetProductionCenter = async (req, res) => {
    try {
        // 1. Destructure created_by
        const { target_department_id, productioncenter_id, target_quantity, start_date, end_date, created_by } = req.body;

        // 2. Updated Validation
        if (!target_department_id || !productioncenter_id || !target_quantity || !start_date || !end_date || !created_by) {
            return res.status(400).json({ message: "All fields including created_by are required" });
        }

        // Check for existing target in the same date range
        const [existing] = await db.query(
            `SELECT * FROM target_productioncenter
             WHERE target_department_id = ? AND productioncenter_id = ? 
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [target_department_id, productioncenter_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this production center in this date range" });
        }

        // 3. Insert with created_by
        const [result] = await db.query(
            `INSERT INTO target_productioncenter 
             (target_department_id, productioncenter_id, target_quantity, start_date, end_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [target_department_id, productioncenter_id, target_quantity, start_date, end_date, created_by]
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
        // 1. Pagination Params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 2. Total Count
        const [countRows] = await db.query('SELECT COUNT(*) as total FROM target_productioncenter');
        const total = countRows[0].total;

        // 3. Data Query
        const [rows] = await db.query(
            `SELECT tpc.*, 
                    td.id AS department_id, td.role_id, td.target_tag,
                    pc.id AS productioncenter_id, pc.name_of_production_centre AS productioncenter_name,
                    uc.username AS created_by_name
             FROM target_productioncenter tpc
             JOIN target_department td ON tpc.target_department_id = td.id
             JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
             LEFT JOIN users_customuser uc ON tpc.created_by = uc.id
             LIMIT ? OFFSET ?`,
             [limit, offset]
        );

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
        
        // 5. Added JOIN with users_customuser
        const [rows] = await db.query(
            `SELECT tpc.*, uc.username AS created_by_name 
             FROM target_productioncenter tpc
             LEFT JOIN users_customuser uc ON tpc.created_by = uc.id
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
        const { target_department_id, productioncenter_id, target_quantity, start_date, end_date } = req.body;

        await db.query(
            `UPDATE target_productioncenter
             SET target_department_id = ?, productioncenter_id = ?, target_quantity = ?, start_date = ?, end_date = ?
             WHERE id = ?`,
            [target_department_id, productioncenter_id, target_quantity, start_date, end_date, id]
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

