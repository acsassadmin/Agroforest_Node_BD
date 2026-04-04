const db = require("../../db");
const jwt = require("jsonwebtoken");

const formatToDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toISOString().split("T")[0];
};

// ===================== CREATE TARGET DISTRICT =====================
exports.createTargetDistrict = async (req, res) => {
    try {
        const { target_department_id, district_id, target_quantity, start_date, end_date, status, created_by, scheme_type, scheme_id } = req.body;
        
        // ✅ UPDATED: Explicit checks for ALL required fields so we know exactly what is missing
        if (!target_department_id) {
            return res.status(400).json({ message: "Missing: target_department_id" });
        }
        if (!district_id) {
            return res.status(400).json({ message: "Missing: district_id" });
        }
        if (target_quantity === undefined || target_quantity === null || Number(target_quantity) <= 0) {
            return res.status(400).json({ message: "Missing or invalid: target_quantity" });
        }
        if (!start_date) {
            return res.status(400).json({ message: "Missing: start_date" });
        }
        if (!created_by) {
            return res.status(400).json({ message: "Missing: created_by" });
        }
        if (!scheme_type) {
            return res.status(400).json({ message: "Missing: scheme_type" });
        }
        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required when Scheme type is selected" });
        }
        
        const finalStartDate = formatToDate(start_date);
        
        // ✅ Automatically calculate end_date from start_date (Block style)
        const year = new Date(finalStartDate).getFullYear();
        const finalEndDate = `${year}-03-31`;
        
        // ✅ Exact Year Match logic (same as Block & Department)
        let checkQuery = `
            SELECT * FROM target_district 
            WHERE target_department_id = ? 
              AND district_id = ? 
              AND start_date = ? 
              AND scheme_type = ? 
        `;
        
        let checkParams = [
            target_department_id, 
            district_id, 
            finalStartDate,
            scheme_type
        ];

        // If it's a Scheme, strictly match the scheme_id
        if (scheme_type === "Scheme") {
            checkQuery += ` AND scheme_id = ?`;
            checkParams.push(scheme_id);
        } else {
            // If it's Non-Scheme, strictly match where scheme_id is NULL
            checkQuery += ` AND scheme_id IS NULL`;
        }

        const [existing] = await db.query(checkQuery, checkParams);
        
        if (existing.length > 0) {
            return res.status(400).json({ message: "Target already exists for this district and scheme in this financial year" });
        }
        
        const [result] = await db.query(
            `INSERT INTO target_district (target_department_id, district_id, target_quantity, start_date, end_date, status, created_by, scheme_type, scheme_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [target_department_id, district_id, target_quantity, finalStartDate, finalEndDate, status || 'Active', created_by, scheme_type, scheme_id || null]
        );
        
        res.status(201).json({ message: "Target District created successfully", target_id: result.insertId });
    } catch (err) {
        console.error("Create Target District Error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getAllTargetDistricts = async (req, res) => {
    try {
        // 1. Get user_id from query params
        const userId = req.query.user_id;

        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: "user_id query parameter is required" 
            });
        }

        // 2. Get User's Role ID, Department ID, and District ID
        const [userRow] = await db.query(
            `SELECT role_id, department_id, district_id FROM users_customuser WHERE id = ?`, 
            [userId]
        );

        if (userRow.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const { role_id, department_id: uDeptId, district_id: uDistId } = userRow[0];

        // 3. Get Role Name from users_role table
        const [roleRow] = await db.query(
            `SELECT name FROM users_role WHERE id = ?`, 
            [role_id]
        );

        if (roleRow.length === 0) {
            return res.status(404).json({ success: false, message: "User role not found" });
        }

        const userRole = roleRow[0].name;

        // 4. Fetch Department Limits (Only applicable for department_admin)
        let deptLimits = { scheme_limit: 0, non_scheme_limit: 0 };
        
        if (userRole === 'department_admin') {
            if (!uDeptId) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Department admin must have a department assigned" 
                });
            }

            const [limitRows] = await db.query(
                `SELECT scheme_type, SUM(target_quantity) as total_assigned
                 FROM target_department 
                 WHERE department_id = ? 
                 GROUP BY scheme_type`, 
                [uDeptId]
            );

            if (limitRows && limitRows.length > 0) {
                limitRows.forEach(row => {
                    const val = Number(row.total_assigned || 0);
                    if (row.scheme_type === 'Scheme') {
                        deptLimits.scheme_limit = val;
                    } else if (row.scheme_type === 'Non-Scheme') {
                        deptLimits.non_scheme_limit = val;
                    }
                });
            }
        }

        // 5. Build Dynamic WHERE clause for District Targets
        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (userRole === 'department_admin') {
            whereClause += ' AND td.target_department_id = ?';
            queryParams.push(uDeptId);
        } 
        else if (userRole === 'district_admin') {
            if (!uDistId) {
                return res.status(400).json({ 
                    success: false, 
                    message: "District admin must have a district assigned" 
                });
            }
            whereClause += ' AND td.district_id = ?';
            queryParams.push(uDistId);
        }
        // If 'superadmin', whereClause remains 'WHERE 1=1' (shows everything)

        // 6. Fetch Existing District Targets
        const dataQuery = `
            SELECT 
                td.*, 
                d.name AS department_name,
                md.District_Name AS district_name,
                uc.username AS created_by_name, 
                s.name AS scheme_name
            FROM target_district td
            INNER JOIN master_district md ON td.district_id = md.id
            LEFT JOIN department d ON td.target_department_id = d.id 
            LEFT JOIN users_customuser uc ON td.created_by = uc.id
            LEFT JOIN tn_schema s ON CAST(td.scheme_id AS CHAR) = CAST(s.id AS CHAR)
            ${whereClause}
            ORDER BY td.id DESC
        `;

        const [rows] = await db.query(dataQuery, queryParams);

        // 7. Construct Final Response
        res.status(200).json({
            success: true,
            data: rows || [],
            meta: deptLimits, // Will be {0,0} for superadmin/district_admin, populated for dept_admin
            user_role: userRole,
            filtered_by: userRole === 'superadmin' ? 'all' : 
                         userRole === 'department_admin' ? `department_${uDeptId}` : 
                         `district_${uDistId}`
        });

    } catch (err) {
        console.error("GET District Targets Error:", err);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            message: "Failed to fetch district targets" 
        });
    }
};


// ===================== GET TARGET DISTRICT BY ID =====================
exports.getTargetDistrictById = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT td.*, md.District_Name AS district_name, uc.username AS created_by_name, s.name AS scheme_name
             FROM target_district td
             JOIN master_district md ON td.district_id = md.id
             LEFT JOIN users_customuser uc ON td.created_by = uc.id
             LEFT JOIN tn_schema s ON td.scheme_id = s.id
             WHERE td.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Not found" });
        res.status(200).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ===================== UPDATE TARGET DISTRICT =====================
exports.updateTargetDistrict = async (req, res) => {
    try {
        const { id } = req.params;
        const { target_department_id, district_id, target_quantity, start_date, end_date, status, scheme_type = "Non-Scheme", scheme_id = null } = req.body;
        const finalStartDate = formatToDate(start_date);
        const finalEndDate = formatToDate(end_date);
        await db.query(
            `UPDATE target_district SET target_department_id = ?, district_id = ?, target_quantity = ?, start_date = ?, end_date = ?, status = ?, scheme_type = ?, scheme_id = ? WHERE id = ?`,
            [target_department_id, district_id, target_quantity, finalStartDate, finalEndDate, status, scheme_type, scheme_id, id]
        );
        res.status(200).json({ message: "Updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ===================== DELETE TARGET DISTRICT =====================
exports.deleteTargetDistrict = async (req, res) => {
    try {
        await db.query(`DELETE FROM target_district WHERE id = ?`, [req.params.id]);
        res.status(200).json({ message: "Deleted successfully" });
    } catch (err) {
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