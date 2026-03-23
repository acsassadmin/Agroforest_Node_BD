const db = require('../../db');

// ===================== CREATE TARGET DISTRICT =====================
exports.createTargetDistrict = async (req, res) => {
    try {
        const { target_department_id, district_id, target_quantity, start_date, end_date } = req.body;

        if (!target_department_id || !district_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [existing] = await db.query(
            `SELECT * FROM target_district 
             WHERE target_department_id = ? AND district_id = ?
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [target_department_id, district_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this district in this date range" });
        }

        const [result] = await db.query(
            `INSERT INTO target_district 
            (target_department_id, district_id, target_quantity, start_date, end_date) 
            VALUES (?, ?, ?, ?, ?)`,
            [target_department_id, district_id, target_quantity, start_date, end_date]
        );

        res.status(201).json({ message: "Target District created successfully", target_id: result.insertId });

    } catch (err) {
        console.error("Create Target District Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGET DISTRICTS =====================
exports.getAllTargetDistricts = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT td.*, td.target_quantity, td.start_date, td.end_date, 
                    t.id AS department_id, t.role_id, t.target_tag,
                    md.id AS district_id, md.District_Name AS district_name
             FROM target_district td
             JOIN target_department t ON td.target_department_id = t.id
             JOIN master_district md ON td.district_id = md.id`
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Get All Target Districts Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET DISTRICT BY ID =====================
exports.getTargetDistrictById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(
            `SELECT * FROM target_district WHERE id = ?`, [id]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Target District not found" });
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Get Target District By ID Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== UPDATE TARGET DISTRICT =====================
exports.updateTargetDistrict = async (req, res) => {
    try {
        const { id } = req.params;
        const { target_department_id, district_id, target_quantity, start_date, end_date } = req.body;

        await db.query(
            `UPDATE target_district 
             SET target_department_id = ?, district_id = ?, target_quantity = ?, start_date = ?, end_date = ?
             WHERE id = ?`,
            [target_department_id, district_id, target_quantity, start_date, end_date, id]
        );

        res.status(200).json({ message: "Target District updated successfully" });
    } catch (err) {
        console.error("Update Target District Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== DELETE TARGET DISTRICT =====================
exports.deleteTargetDistrict = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`DELETE FROM target_district WHERE id = ?`, [id]);
        res.status(200).json({ message: "Target District deleted successfully" });
    } catch (err) {
        console.error("Delete Target District Error:", err);
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
        const [rows] = await db.query(
            `SELECT id, District_Name AS name FROM master_district`
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("Get Districts Error:", err);
        res.status(500).json({ error: err.message });
    }
};