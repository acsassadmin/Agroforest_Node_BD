const db = require('../../db');

// ===================== CREATE TARGET PRODUCTION CENTER =====================
exports.createTargetProductionCenter = async (req, res) => {
    try {
        const { target_department_id, productioncenter_id, target_quantity, start_date, end_date } = req.body;

        if (!target_department_id || !productioncenter_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
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

        const [result] = await db.query(
            `INSERT INTO target_productioncenter 
             (target_department_id, productioncenter_id, target_quantity, start_date, end_date)
             VALUES (?, ?, ?, ?, ?)`,
            [target_department_id, productioncenter_id, target_quantity, start_date, end_date]
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
        const [rows] = await db.query(
            `SELECT tpc.*, td.id AS department_id, td.role_id, td.target_tag,
                    pc.id AS productioncenter_id, pc.name_of_production_centre AS productioncenter_name
             FROM target_productioncenter tpc
             JOIN target_department td ON tpc.target_department_id = td.id
             JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id`
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Get All Target Production Centers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET PRODUCTION CENTER BY ID =====================
exports.getTargetProductionCenterById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`SELECT * FROM target_productioncenter WHERE id = ?`, [id]);
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

// ===================== DROPDOWN: PRODUCTION CENTERS =====================
exports.getProductionCenters = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, name_of_production_centre AS name FROM productioncenter_productioncenter`
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Get Production Centers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== DROPDOWN: TARGET DEPARTMENTS =====================
exports.getTargetDepartments = async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT id, role_id, target_tag FROM target_department`);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Get Target Departments Error:", err);
        res.status(500).json({ error: err.message });
    }
};