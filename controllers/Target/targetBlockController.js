const db = require('../../db');

// ===================== CREATE TARGET BLOCK =====================
exports.createTargetBlock = async (req, res) => {
    try {
        const { target_department_id, district_id, target_quantity, start_date, end_date } = req.body;

        if (!target_department_id || !district_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [existing] = await db.query(
            `SELECT * FROM target_block 
             WHERE target_department_id = ? AND district_id = ?
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [target_department_id, district_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this block in this date range" });
        }

        const [result] = await db.query(
            `INSERT INTO target_block 
            (target_department_id, district_id, target_quantity, start_date, end_date) 
            VALUES (?, ?, ?, ?, ?)`,
            [target_department_id, district_id, target_quantity, start_date, end_date]
        );

        res.status(201).json({ message: "Target Block created successfully", target_id: result.insertId });

    } catch (err) {
        console.error("Create Target Block Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGET BLOCKS =====================
exports.getAllTargetBlocks = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT tb.*, td.id AS department_id, td.role_id, td.target_tag, 
                    md.id AS district_id, md.District_Name AS district_name
             FROM target_block tb
             JOIN target_department td ON tb.target_department_id = td.id
             JOIN master_district md ON tb.district_id = md.id`
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Get All Target Blocks Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET BLOCK BY ID =====================
exports.getTargetBlockById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`SELECT * FROM target_block WHERE id = ?`, [id]);
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
        const { target_department_id, district_id, target_quantity, start_date, end_date } = req.body;

        await db.query(
            `UPDATE target_block 
             SET target_department_id = ?, district_id = ?, target_quantity = ?, start_date = ?, end_date = ?
             WHERE id = ?`,
            [target_department_id, district_id, target_quantity, start_date, end_date, id]
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

// ===================== DROPDOWNS =====================
exports.getTargetDepartments = async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT id, role_id, target_tag FROM target_department`);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Get Target Departments Error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getDistricts = async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT id, District_Name AS name FROM master_district`);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Get Districts Error:", err);
        res.status(500).json({ error: err.message });
    }
};