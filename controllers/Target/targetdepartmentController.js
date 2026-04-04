const db = require("../../db");

// ===================== STRICT DATE FORMATTER =====================
const formatToDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0]; 
};

// ===================== CREATE TARGET DEPARTMENT =====================
exports.createTargetDepartment = async (req, res) => {
  try {
    const { 
      department_id, 
      target_quantity, 
      financial_year,
      created_by,
      scheme_type,   
      scheme_id      
    } = req.body;

    // 1. Basic Field Validation
    if (!department_id || !target_quantity|| !created_by || !financial_year) {
      return res.status(400).json({ message: "Department, Quantity, Dates, and Creator are required" });
    }

    // 2. Scheme Logic Validation
    if (scheme_type === "Scheme" && !scheme_id) {
      return res.status(400).json({ message: "Scheme ID is required when Scheme type is selected" });
    }

    // 3. Validate Department ID
    const [dept] = await db.query(`SELECT * FROM department WHERE id = ?`, [department_id]);
    if (dept.length === 0) {
      return res.status(400).json({ message: "Invalid department selected" });
    }


    // 5. Determine final scheme type
    const finalSchemeType = scheme_type || "Non-Scheme";

    // ===================== UPDATED DUPLICATE CHECK LOGIC (Similar to Block) =====================
    const [existing] = await db.query(
      `SELECT id FROM target_department 
       WHERE department_id = ? 
       AND (scheme_id = ? OR (scheme_id IS NULL AND ? IS NULL))`,
      [department_id, finalSchemeType, scheme_id || null, scheme_id || null]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        message: "A target for this department and scheme already exists for this period." 
      });
    }
    // =========================================================================================

    // 6. Insert Data
    const [result] = await db.query(
      `INSERT INTO target_department 
       (department_id, target_quantity, created_by, scheme_type, scheme_id ,financial_year) 
       VALUES (?, ?, ?,  ?, ? , ?)`,
      [
        department_id, 
        target_quantity, 
        created_by, 
        finalSchemeType, 
        scheme_id || null,
        financial_year          
      ]
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

// ===================== UPDATE TARGET DEPARTMENT =====================
exports.updateTargetDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            department_id, 
            target_quantity, 
            district_id = null, 
            block_id = null, 
            production_center_id = null,
            scheme_type,
            financial_year,
            scheme_id = null
        } = req.body;
        console.log(department_id,"department")
      

        const [dept] = await db.query(`SELECT * FROM department WHERE id = ?`, [department_id]);
        if (dept.length === 0) return res.status(400).json({ message: "Invalid department selected" });

        const [existing] = await db.query(`SELECT * FROM target_department WHERE id = ?`, [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Target Department not found" });

        if (scheme_type === "Scheme" && scheme_id) {
            const [scheme] = await db.query(`SELECT * FROM tn_schema WHERE id = ?`, [scheme_id]);
            if (scheme.length === 0) return res.status(400).json({ message: "Invalid scheme selected" });
        }

        const finalSchemeType = scheme_type || existing[0].scheme_type || "Non-Scheme";

        // ===================== UPDATED OVERLAP CHECK FOR UPDATE =====================
        let overlapQuery, overlapParams;

        if (finalSchemeType === "Scheme") {
            overlapQuery = `
                SELECT * FROM target_department 
                WHERE department_id = ? 
                AND scheme_type = 'Scheme'
                AND scheme_id = ?
                AND id != ?
                
            `;
            overlapParams = [department_id, scheme_id, id, ];
        } else {
            overlapQuery = `
                SELECT * FROM target_department 
                WHERE department_id = ? 
                AND scheme_type = 'Non-Scheme'
                AND id != ?
               
            `;
            overlapParams = [department_id, id];
        }

        const [overlapExist] = await db.query(overlapQuery, overlapParams);

        if (overlapExist.length > 0) {
            let errorMsg = "Target already exists for this department in this date range";
            if (finalSchemeType === "Scheme") {
                errorMsg = "Target already exists for this department with the selected scheme in this date range";
            }
            return res.status(400).json({ message: errorMsg });
        }
        // ==================================================================

        await db.query(
            `UPDATE target_department 
            SET department_id = ?, target_quantity = ?, 
                district_id = ?, block_id = ?, production_center_id = ?, scheme_type = ?, scheme_id = ?, financial_year = ?
            WHERE id = ?`,
            [department_id, target_quantity, district_id, block_id, production_center_id, finalSchemeType, scheme_id , financial_year, id]
        );

        res.status(200).json({ message: "Target Department updated successfully" });

    } catch (err) {
        console.error("Update Target Department Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGET DEPARTMENTS =====================
exports.getAllTargetDepartments = async (req, res) => {
    try {
        const userId = req.query.user_id;

        // Step 1: Get user's role_id and department_id from users_customuser
        const [userRows] = await db.query(
            'SELECT role_id, department_id FROM users_customuser WHERE id = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { role_id, department_id } = userRows[0];

        // Step 2: Get role value from users_role table using role_id
        const [roleRows] = await db.query(
            'SELECT name FROM users_role WHERE id = ?',
            [role_id]
        );

        if (roleRows.length === 0) {
            return res.status(404).json({ error: 'Role not found' });
        }

        const userRole = roleRows[0].name;

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Step 3: Build queries based on user role
        let whereClause = '';
        let queryParams = [];
        let countParams = [];

        if (userRole === 'department_admin') {
            if (!department_id) {
                return res.status(400).json({ 
                    error: 'Department admin must have a department assigned' 
                });
            }
            whereClause = 'WHERE td.department_id = ?';
            countParams.push(department_id);
            queryParams.push(department_id);
        }
        // For superadmin, whereClause remains empty - show all targets

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM target_department td 
            ${whereClause}
        `;

        // Data query
        const selectQuery = `
            SELECT 
                td.id AS target_id, 
                td.department_id, 
                td.financial_year,
                d.name AS department_name, 
                td.target_quantity, 
                td.scheme_type, 
                td.production_center_count, 
                td.created_by AS created_by_id, 
                uc.username AS created_by_name, 
                td.district_id, 
                dist.District_Name AS district_name, 
                td.block_id, 
                blk.Block_Name AS block_name, 
                td.production_center_id, 
                pc.name_of_production_centre AS production_center_name, 
                td.scheme_id, 
                s.name AS scheme_name, 
                s.percentage AS scheme_percentage, 
                s.species_preferred AS scheme_species 
            FROM target_department td 
            JOIN department d ON td.department_id = d.id 
            LEFT JOIN users_customuser uc ON td.created_by = uc.id 
            LEFT JOIN master_district dist ON td.district_id = dist.id 
            LEFT JOIN master_block blk ON td.block_id = blk.id 
            LEFT JOIN productioncenter_productioncenter pc ON td.production_center_id = pc.id 
            LEFT JOIN tn_schema s ON td.scheme_id = s.id 
            ${whereClause}
            ORDER BY td.id DESC
            LIMIT ? OFFSET ?
        `;

        queryParams.push(limit, offset);

        // Execute queries
        const [countRows] = await db.query(countQuery, countParams);
        const total = countRows[0].total;

        const [rows] = await db.query(selectQuery, queryParams);

        res.status(200).json({ 
            data: rows, 
            pagination: { 
                total, 
                page, 
                limit, 
                totalPages: Math.ceil(total / limit) 
            },
            meta: {
                userRole: userRole,
                filteredByDepartment: userRole === 'department_admin' ? department_id : null
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

        const [rows] = await db.query(
            `SELECT 
                td.id AS target_id,
                td.department_id,
                d.name AS department_name,
                td.target_quantity,
                td.production_center_count,
                td.created_by AS created_by_id,
                uc.username AS created_by_name,
                td.district_id,
                dist.District_Name AS district_name,
                td.block_id,
                blk.Block_Name AS block_name,
                td.production_center_id,
                pc.name_of_production_centre AS production_center_name,
                td.scheme_type,
                td.scheme_id,
                s.name AS scheme_name,
                s.percentage AS scheme_percentage,
                s.species_preferred AS scheme_species
            FROM target_department td
            JOIN department d ON td.department_id = d.id
            LEFT JOIN users_customuser uc ON td.created_by = uc.id
            LEFT JOIN master_district dist ON td.district_id = dist.id
            LEFT JOIN master_block blk ON td.block_id = blk.id
            LEFT JOIN productioncenter_productioncenter pc ON td.production_center_id = pc.id
            LEFT JOIN tn_schema s ON td.scheme_id = s.id
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

// ===================== GET ALL SCHEMES =====================
exports.getAllSchemes = async (req, res) => {
    try {
        const [schemes] = await db.query(`SELECT id, name, percentage, species_preferred FROM tn_schema`);
        res.status(200).json(schemes);
    } catch (err) {
        console.error("Get All Schemes Error:", err);
        res.status(500).json({ error: err.message });
    }
};