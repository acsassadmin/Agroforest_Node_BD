const db = require("../../db");

// ===================== CREATE TARGET =====================
exports.createTarget = async (req, res) => {
    try {
        // Log body only if it exists
        if (req.body && Object.keys(req.body).length) {
            console.log("req.body:", req.body);
        }

        const { role, target_tag, target_quantity, start_date, end_date } = req.body;

        if (!role || !target_tag || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [existing] = await db.query(
            `SELECT * FROM target 
             WHERE role = ? AND target_tag = ?
             AND (
                (? BETWEEN start_date AND end_date)
                OR
                (? BETWEEN start_date AND end_date)
             )`,
            [role, target_tag, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this item in this date range" });
        }

        const [result] = await db.query(
            `INSERT INTO target (role, target_tag, target_quantity, start_date, end_date)
             VALUES (?, ?, ?, ?, ?)`,
            [role, target_tag, target_quantity, start_date, end_date]
        );

        res.status(201).json({
            message: "Target created successfully",
            target_id: result.insertId
        });

    } catch (err) {
        console.error("Create Target Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== ASSIGN TARGET DOWN THE HIERARCHY =====================
exports.assignTarget = async (req, res) => {
    try {
        const { target_id, from_user_id, to_user_id, level } = req.body;

        if (!target_id || !from_user_id || !to_user_id || !level) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // 1️⃣ Get target date range
        const [[target]] = await db.query(
            `SELECT start_date, end_date FROM target WHERE id = ?`,
            [target_id]
        );

        if (!target) {
            return res.status(404).json({ message: "Target not found" });
        }

        const { start_date, end_date } = target;

        // 2️⃣ Check if already assigned in overlapping dates
        const [existingAssignments] = await db.query(
            `SELECT tal.* 
             FROM target_assignment_log tal
             JOIN target t ON tal.target_id = t.id
             WHERE tal.to_user_id = ?
             AND (
                (? BETWEEN t.start_date AND t.end_date)
                OR
                (? BETWEEN t.start_date AND t.end_date)
                OR
                (t.start_date BETWEEN ? AND ?)
             )`,
            [to_user_id, start_date, end_date, start_date, end_date]
        );

        if (existingAssignments.length > 0) {
            return res.status(400).json({
                message: "Target already assigned to this user in overlapping date range"
            });
        }

        // 3️⃣ Insert assignment
        await db.query(
            `INSERT INTO target_assignment_log (target_id, from_user_id, to_user_id, level)
             VALUES (?, ?, ?, ?)`,
            [target_id, from_user_id, to_user_id, level]
        );

        // 4️⃣ Update level
        await db.query(
            `UPDATE target SET level = ? WHERE id = ?`,
            [level, target_id]
        );

        res.status(200).json({ message: `Target assigned to ${level} successfully` });

    } catch (err) {
        console.error("Assign Target Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET AVAILABLE ITEMS FOR DROPDOWN BY ROLE =====================
exports.getAvailableItems = async (req, res) => {
    try {
        const { role } = req.query;
        let items;

        if (role === "department") {
            [items] = await db.query(
                `SELECT id, name FROM department
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'department')`
            );
        } else if (role === "district") {
            [items] = await db.query(
                `SELECT id, name FROM master_district
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'district')`
            );
        } else if (role === "block") {
            [items] = await db.query(
                `SELECT id, name FROM master_blocks
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'block')`
            );
        } else if (role === "production_center") {
            [items] = await db.query(
                `SELECT id, name FROM productioncenter_productioncenter
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'production_center')`
            );
        } else {
            return res.status(400).json({ message: "Invalid role" });
        }

        res.status(200).json(items);

    } catch (err) {
        console.error("Get Available Items Error:", err);
        res.status(500).json({ error: err.message });
    }
};




// controllers/Target/targetController.js
exports.editTarget = async (req, res) => {
    try {
        const { target_id, target_quantity, start_date, end_date } = req.body;

        if (!target_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check if the target exists
        const [existing] = await db.query(
            `SELECT * FROM target WHERE id = ?`,
            [target_id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: "Target not found" });
        }

        const target = existing[0];

        // Restrict editing: only allow edit if today is before start_date
        const today = new Date();
        const startDate = new Date(target.start_date);

        if (today >= startDate) {
            return res.status(403).json({ message: "Cannot edit target after start date" });
        }

        // Update target
        await db.query(
            `UPDATE target
             SET target_quantity = ?, start_date = ?, end_date = ?
             WHERE id = ?`,
            [target_quantity, start_date, end_date, target_id]
        );

        res.status(200).json({ message: "Target updated successfully" });

    } catch (err) {
        console.error("Edit Target Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== FETCH ALL ITEMS FROM ANY TABLE =====================
exports.getTableData = async (req, res) => {
    try {
        const { table } = req.query;

        const validTables = [
            "department",
            "master_district",
            "master_blocks",
            "productioncenter_productioncenter"
        ];

        if (!validTables.includes(table)) {
            return res.status(400).json({ message: "Invalid table name" });
        }

        const [rows] = await db.query(`SELECT id, name FROM ${table}`);
        res.status(200).json(rows);

    } catch (err) {
        console.error("Fetch Table Data Error:", err);
        res.status(500).json({ error: err.message });
    }
};