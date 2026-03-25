const db = require('../../db');

// ===================== CREATE TARGET BLOCK =====================
exports.createTargetBlock = async (req, res) => {
    try {
        // 1. Destructure created_by from body
        const { target_department_id, district_id, target_quantity, start_date, end_date, created_by } = req.body;

        // 2. Updated Validation
        if (!target_department_id || !district_id || !target_quantity || !start_date || !end_date || !created_by) {
            return res.status(400).json({ message: "All fields including created_by are required" });
        }

        // Check if target_department_id exists
        const [dept] = await db.query(`SELECT id FROM target_department WHERE id = ?`, [target_department_id]);
        if (dept.length === 0) {
            return res.status(400).json({ message: "Invalid target_department_id" });
        }

        // Check if block exists (Note: Your code maps district_id variable to master_block table)
        const [district] = await db.query(`SELECT id FROM master_block WHERE id = ?`, [district_id]);
        if (district.length === 0) {
            return res.status(400).json({ message: "Invalid district_id" });
        }

        // Check for existing target in date range
        const [existing] = await db.query(
            `SELECT * FROM target_block 
             WHERE target_department_id = ? AND district_id = ? 
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [target_department_id, district_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this block in this date range" });
        }

        // 3. Insert with created_by
        const [result] = await db.query(
            `INSERT INTO target_block 
            (target_department_id, district_id, target_quantity, start_date, end_date, created_by) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [target_department_id, district_id, target_quantity, start_date, end_date, created_by]
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
        const { district_id } = req.query;

        // 1. Pagination Params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        let countQuery = `SELECT COUNT(*) as total FROM target_block tb JOIN master_block mb ON tb.district_id = mb.id`;
        let dataQuery = `
            SELECT tb.*, 
                   td.id AS department_id, 
                   td.role_id, 
                   mb.id AS block_id, 
                   mb.Block_Name AS block_name,
                   uc.username AS created_by_name
             FROM target_block tb
             JOIN target_department td ON tb.target_department_id = td.id
             JOIN master_block mb ON tb.district_id = mb.id
             LEFT JOIN users_customuser uc ON tb.created_by = uc.id
        `;

        const params = [];
        const countParams = [];

        // 2. Filter Logic
        if (district_id) {
            dataQuery += " WHERE mb.district_id = ?";
            countQuery += " WHERE mb.district_id = ?";
            params.push(district_id);
            countParams.push(district_id);
        }

        // 3. Get Total Count
        const [countRows] = await db.query(countQuery, countParams);
        const total = countRows[0].total;

        // 4. Add Pagination
        dataQuery += " LIMIT ? OFFSET ?";
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
        console.error("Get All Target Blocks Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET BLOCK BY ID =====================
exports.getTargetBlockById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 5. Added JOIN with users_customuser
        const [rows] = await db.query(
            `SELECT tb.*, uc.username AS created_by_name 
             FROM target_block tb
             LEFT JOIN users_customuser uc ON tb.created_by = uc.id
             WHERE tb.id = ?`, 
             [id]
        );

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

        // Check valid foreign keys
        const [dept] = await db.query(`SELECT id FROM target_department WHERE id = ?`, [target_department_id]);
        if (dept.length === 0) return res.status(400).json({ message: "Invalid target_department_id" });

        const [district] = await db.query(`SELECT id FROM master_block WHERE id = ?`, [district_id]);
        if (district.length === 0) return res.status(400).json({ message: "Invalid district_id" });

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

