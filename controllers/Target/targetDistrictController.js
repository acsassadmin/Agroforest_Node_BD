const db = require('../../db');

// ===================== CREATE TARGET DISTRICT =====================
exports.createTargetDistrict = async (req, res) => {
    try {
        // 1. Destructure created_by from body
        const { target_department_id, district_id, target_quantity, start_date, end_date, status, created_by } = req.body;

        // 2. Validation updated to include created_by
        if (!target_department_id || !district_id || target_quantity === undefined || !start_date || !end_date || !created_by) {
            console.log("Validation Failed: Missing fields");
            return res.status(400).json({ message: "All fields including created_by are required" });
        }

        const [dbCheck] = await db.query('SELECT DATABASE() as currentDb');
        console.log("CURRENTLY CONNECTED TO DATABASE:", dbCheck[0].currentDb);

        // Check Overlap
        const [existing] = await db.query(
            `SELECT * FROM target_district 
             WHERE target_department_id = ? AND district_id = ?
             AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))`,
            [target_department_id, district_id, start_date, end_date]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this district in this date range" });
        }

        // 3. Insert Data with created_by
        const [result] = await db.query(
            `INSERT INTO target_district 
            (target_department_id, district_id, target_quantity, start_date, end_date, status, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [target_department_id, district_id, target_quantity, start_date, end_date, status || 'Active', created_by]
        );
        
        console.log("Database Insert Result:", result);

        // 4. Fetch new record with User Name
        const [newTarget] = await db.query(
            `SELECT td.*, md.District_Name AS district_name, uc.username AS created_by_name
             FROM target_district td
             JOIN master_district md ON td.district_id = md.id
             LEFT JOIN users_customuser uc ON td.created_by = uc.id
             WHERE td.id = ?`,
            [result.insertId]
        );

        res.status(201).json({ 
            message: "Target District created successfully", 
            data: newTarget[0] 
        });

    } catch (err) {
        console.error("Create Target District Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGET DISTRICTS (List View) =====================
exports.getAllTargetDistricts = async (req, res) => {
    try {
        const { target_department_id } = req.query;
        
        // 1. Pagination Params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        let countQuery = `SELECT COUNT(*) as total FROM target_district td`;
        let dataQuery = `
            SELECT td.id, 
                   td.target_department_id,
                   td.target_quantity, 
                   td.start_date, 
                   td.end_date, 
                   td.status,
                   md.District_Name AS district_name,
                   CONCAT(td.start_date, ' to ', td.end_date) AS duration,
                   uc.username AS created_by_name
            FROM target_district td
            JOIN master_district md ON td.district_id = md.id
            LEFT JOIN users_customuser uc ON td.created_by = uc.id
        `;

        const params = [];
        const countParams = [];

        // 2. Filter Logic
        if (target_department_id) {
            dataQuery += " WHERE td.target_department_id = ?";
            countQuery += " WHERE td.target_department_id = ?";
            params.push(target_department_id);
            countParams.push(target_department_id);
        }

        // 3. Get Total Count
        const [countRows] = await db.query(countQuery, countParams);
        const total = countRows[0].total;

        // 4. Add Pagination to Data Query
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
        console.error("Get All Target Districts Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET TARGET DISTRICT BY ID (Edit View) =====================
exports.getTargetDistrictById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Added JOIN with users_customuser
        const [rows] = await db.query(
            `SELECT td.*, md.District_Name AS district_name, uc.username AS created_by_name
             FROM target_district td
             JOIN master_district md ON td.district_id = md.id
             LEFT JOIN users_customuser uc ON td.created_by = uc.id
             WHERE td.id = ?`, 
             [id]
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
        // Note: created_by is typically not updated, but if you need to update other fields:
        const { target_department_id, district_id, target_quantity, start_date, end_date, status } = req.body;

        await db.query(
            `UPDATE target_district 
             SET target_department_id = ?, district_id = ?, target_quantity = ?, start_date = ?, end_date = ?, status = ?
             WHERE id = ?`,
            [target_department_id, district_id, target_quantity, start_date, end_date, status, id]
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