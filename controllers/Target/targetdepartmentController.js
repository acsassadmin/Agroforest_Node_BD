const db = require("../../db");

// ===================== CREATE TARGET DEPARTMENT =====================
exports.createTargetDepartment = async (req, res) => {
    try {
        const { 
            department_id, 
            target_quantity, 
            start_date, 
            end_date, 
            created_by,
            district_id,        
            block_id,           
            production_center_id 
        } = req.body;

        if (!department_id || !target_quantity || !start_date || !end_date || !created_by) {
            return res.status(400).json({ message: "Department, Quantity, Dates, and Creator are required" });
        }

        const [dept] = await db.query(`SELECT * FROM department WHERE id = ?`, [department_id]);
        if (dept.length === 0) return res.status(400).json({ message: "Invalid department selected" });

        // Check for overlapping targets
        const [existing] = await db.query(
            `SELECT * FROM target_department 
             WHERE role_id = ? 
             AND (district_id = ? OR (district_id IS NULL AND ? IS NULL))
             AND (block_id = ? OR (block_id IS NULL AND ? IS NULL))
             AND (production_center_id = ? OR (production_center_id IS NULL AND ? IS NULL))
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [department_id, district_id, district_id, block_id, block_id, production_center_id, production_center_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this location scope in this date range" });
        }

        const [result] = await db.query(
            `INSERT INTO target_department 
            (role_id, target_quantity, start_date, end_date, created_by, district_id, block_id, production_center_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [department_id, target_quantity, start_date, end_date, created_by, district_id, block_id, production_center_id]
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [countRows] = await db.query('SELECT COUNT(*) as total FROM target_department');
        const total = countRows[0].total;

        // CORRECTED QUERIES BASED ON YOUR PROVIDED STRUCTURES:
        // 1. master_district: uses 'District_Name'
        // 2. master_block: uses 'Block_Name'
        // 3. productioncenter_productioncenter: uses 'name_of_production_centre'
        const [rows] = await db.query(
            `SELECT 
                td.id AS target_id,
                d.name AS department_name,
                td.target_quantity,
                td.start_date,
                td.end_date,
                td.production_center_count,
                uc.username AS created_by_name,
                
                -- Exact Column Names from your DB
                dist.District_Name AS district_name,
                blk.Block_Name AS block_name,
                pc.name_of_production_centre AS production_center_name
                
            FROM target_department td
            JOIN department d ON td.role_id = d.id
            LEFT JOIN users_customuser uc ON td.created_by = uc.id
            LEFT JOIN master_district dist ON td.district_id = dist.id
            LEFT JOIN master_block blk ON td.block_id = blk.id
            LEFT JOIN productioncenter_productioncenter pc ON td.production_center_id = pc.id
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
        console.error("Get All Target Departments Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET DEPARTMENT BY ID =====================
exports.getTargetDepartmentById = async (req, res) => {
    try {
        const { id } = req.params;

        // CORRECTED QUERIES
        const [rows] = await db.query(
            `SELECT 
                td.*, 
                d.name AS department_name, 
                uc.username AS created_by_name,
                dist.District_Name AS district_name,
                blk.Block_Name AS block_name,
                pc.name_of_production_centre AS production_center_name
            FROM target_department td
            JOIN department d ON td.role_id = d.id
            LEFT JOIN users_customuser uc ON td.created_by = uc.id
            LEFT JOIN master_district dist ON td.district_id = dist.id
            LEFT JOIN master_block blk ON td.block_id = blk.id
            LEFT JOIN productioncenter_productioncenter pc ON td.production_center_id = pc.id
            WHERE td.id = ?`,
            [id]
        );

        if (rows.length === 0) return res.status(404).json({ message: "Target Department not found" });

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
        const { 
            department_id, 
            target_quantity, 
            start_date, 
            end_date, 
            district_id, 
            block_id, 
            production_center_id 
        } = req.body;

        if (!department_id || !target_quantity || !start_date || !end_date) {
            return res.status(400).json({ message: "All core fields are required" });
        }

        const [dept] = await db.query(`SELECT * FROM department WHERE id = ?`, [department_id]);
        if (dept.length === 0) return res.status(400).json({ message: "Invalid department selected" });

        const [existing] = await db.query(`SELECT * FROM target_department WHERE id = ?`, [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Target Department not found" });

        await db.query(
            `UPDATE target_department 
             SET role_id = ?, target_quantity = ?, start_date = ?, end_date = ?, 
                 district_id = ?, block_id = ?, production_center_id = ?
             WHERE id = ?`,
            [department_id, target_quantity, start_date, end_date, district_id, block_id, production_center_id, id]
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

        if (result.affectedRows === 0) return res.status(404).json({ message: "Target Department not found" });

        res.status(200).json({ message: "Target Department deleted successfully" });
    } catch (err) {
        console.error("Delete Target Department Error:", err);
        res.status(500).json({ error: err.message });
    }
};