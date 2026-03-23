const db = require("../../db");

// ===================== CREATE TARGET DEPARTMENT =====================
exports.createTargetDepartment = async (req, res) => {
    try {
        const { department_id, target_tag, target_quantity, start_date, end_date } = req.body;

        if (!department_id || !target_tag || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Validate that department exists
        const [dept] = await db.query(
            `SELECT * FROM department WHERE id = ?`,
            [department_id]
        );
        if (dept.length === 0) {
            return res.status(400).json({ message: "Invalid department selected" });
        }

        // Check if target exists in the date range
        const [existing] = await db.query(
            `SELECT * FROM target_department 
             WHERE role_id = ? AND target_tag = ? 
             AND (
                (? BETWEEN start_date AND end_date) 
                OR 
                (? BETWEEN start_date AND end_date)
             )`,
            [department_id, target_tag, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this department in this date range" });
        }

        const [result] = await db.query(
            `INSERT INTO target_department 
             (role_id, target_tag, target_quantity, start_date, end_date)
             VALUES (?, ?, ?, ?, ?)`,
            [department_id, target_tag, target_quantity, start_date, end_date]
        );

        res.status(201).json({ 
            message: "Target Department created successfully",
            target_id: result.insertId
        });

    } catch (err) {
        console.error("Create Target Department Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGET DEPARTMENTS =====================
exports.getAllTargetDepartments = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT td.*, d.name as department_name 
             FROM target_department td
             JOIN department d ON td.role_id = d.id`
        );

        res.status(200).json(rows);
    } catch (err) {
        console.error("Get All Target Departments Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET DEPARTMENT BY ID =====================
exports.getTargetDepartmentById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT td.*, d.name as department_name 
             FROM target_department td
             JOIN department d ON td.role_id = d.id
             WHERE td.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Target Department not found" });
        }

        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Get Target Department By ID Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== UPDATE TARGET DEPARTMENT =====================
exports.updateTargetDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { department_id, target_tag, target_quantity, start_date, end_date } = req.body;

        if (!department_id || !target_tag || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Validate department exists
        const [dept] = await db.query(`SELECT * FROM department WHERE id = ?`, [department_id]);
        if (dept.length === 0) return res.status(400).json({ message: "Invalid department selected" });

        // Check if target exists
        const [existing] = await db.query(`SELECT * FROM target_department WHERE id = ?`, [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Target Department not found" });

        const today = new Date();
        const startDate = new Date(existing[0].start_date);
        if (today >= startDate) return res.status(403).json({ message: "Cannot edit target after start date" });

        // Update
        await db.query(
            `UPDATE target_department 
             SET role_id = ?, target_tag = ?, target_quantity = ?, start_date = ?, end_date = ?
             WHERE id = ?`,
            [department_id, target_tag, target_quantity, start_date, end_date, id]
        );

        res.status(200).json({ message: "Target Department updated successfully" });

    } catch (err) {
        console.error("Update Target Department Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== DELETE TARGET DEPARTMENT =====================
exports.deleteTargetDepartment = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(`DELETE FROM target_department WHERE id = ?`, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Target Department not found" });
        }

        res.status(200).json({ message: "Target Department deleted successfully" });

    } catch (err) {
        console.error("Delete Target Department Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL DEPARTMENTS FOR DROPDOWN =====================
exports.getDepartments = async (req, res) => {
    try {
        const [departments] = await db.query(`SELECT id, name FROM department`);
        res.status(200).json(departments);
    } catch (err) {
        console.error("Get Departments Error:", err);
        res.status(500).json({ error: err.message });
    }
};