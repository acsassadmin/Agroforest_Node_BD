const db = require("../../db");

// ===================== CREATE TARGET =====================
exports.createTarget = async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ error: "Request body is empty or missing" });
        }

        console.log("req.body:", req.body);

        const { role, target_tag, target_quantity, start_date, end_date, scheme_id = null } = req.body;

        if (!role || !target_tag || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [existing] = await db.query(
            `SELECT * FROM target 
             WHERE role = ? AND target_tag = ?
             AND scheme_id <=> ?
             AND (
                (? BETWEEN start_date AND end_date)
                OR
                (? BETWEEN start_date AND end_date)
             )`,
            [role, target_tag, scheme_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ 
                message: "Target already exists for this item/scheme in this date range" 
            });
        }

        const [result] = await db.query(
            `INSERT INTO target (role, target_tag, target_quantity, start_date, end_date, scheme_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [role, target_tag, target_quantity, start_date, end_date, scheme_id]
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
        let { role } = req.query;

        if (!role) {
            return res.status(400).json({ message: "Role is required" });
        }

        const normalizedRole = role.toLowerCase().trim().replace(/\s+/g, '_');
        let items;

        if (normalizedRole === "department") {
            [items] = await db.query(
                `SELECT id, name FROM department
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'department')`
            );
        } else if (normalizedRole === "district") {
            [items] = await db.query(
                `SELECT id, District_Name as name FROM master_district
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'district')`
            );
        } else if (normalizedRole === "block") {
            [items] = await db.query(
                `SELECT id, Block_Name as name FROM master_blocks
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'block')`
            );
        } else if (normalizedRole === "production_center") {
            [items] = await db.query(
                `SELECT id, name_of_production_centre as name FROM productioncenter_productioncenter
                 WHERE id NOT IN (SELECT target_tag FROM target WHERE role = 'production_center')`
            );
        } else {
            return res.status(400).json({ message: `Invalid role: '${role}'` });
        }

        res.status(200).json(items);

    } catch (err) {
        console.error("Get Available Items Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== EDIT TARGET =====================
exports.editTarget = async (req, res) => {
    try {
        const { target_id, target_quantity, start_date, end_date, scheme_id = null } = req.body;

        if (!target_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [existing] = await db.query(`SELECT * FROM target WHERE id = ?`, [target_id]);

        if (existing.length === 0) {
            return res.status(404).json({ message: "Target not found" });
        }

        const target = existing[0];
        const today = new Date();
        const startDate = new Date(target.start_date);

        if (today >= startDate) {
            return res.status(403).json({ message: "Cannot edit target after start date" });
        }

        await db.query(
            `UPDATE target SET target_quantity = ?, start_date = ?, end_date = ?, scheme_id = ? WHERE id = ?`,
            [target_quantity, start_date, end_date, scheme_id, target_id]
        );

        res.status(200).json({ message: "Target updated successfully" });

    } catch (err) {
        console.error("Edit Target Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGETS (NEW) =====================
// This function fetches the list of created targets to display on the frontend
exports.getAllTargets = async (req, res) => {
    try {
        // We join with tn_schema to show the scheme name if it exists
        const [rows] = await db.query(`
            SELECT 
                t.id, 
                t.role, 
                t.target_tag, 
                t.target_quantity, 
                t.start_date, 
                t.end_date, 
                t.scheme_id,
                s.name as scheme_name
            FROM target t
            LEFT JOIN tn_schema s ON t.scheme_id = s.id
            ORDER BY t.id DESC
        `);
        
        res.status(200).json(rows);
    } catch (err) {
        console.error("Get All Targets Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== FETCH ALL ITEMS FROM ANY TABLE (FIXED) =====================
exports.getTableData = async (req, res) => {
    try {
        let { table } = req.query;

        if (!table) {
            return res.status(400).json({ message: "Table name is required" });
        }

        // Normalize input to prevent case sensitivity issues
        table = table.toLowerCase().trim();

        // Map table names to their correct column names for the dropdown
        const tableConfig = {
            "department": { nameCol: "name" },
            "master_district": { nameCol: "District_Name" },
            "master_blocks": { nameCol: "Block_Name" },
            "productioncenter_productioncenter": { nameCol: "name_of_production_centre" },
            "tn_schema": { nameCol: "name" }
        };

        if (!tableConfig[table]) {
            return res.status(400).json({ message: `Invalid table name: '${table}'` });
        }

        const config = tableConfig[table];

        // Use escaping (??) for identifiers to be safe
        const [rows] = await db.query(`SELECT id, ?? as name FROM ??`, [config.nameCol, table]);
        
        res.status(200).json(rows);

    } catch (err) {
        console.error("Fetch Table Data Error:", err);
        res.status(500).json({ error: err.message });
    }
};

