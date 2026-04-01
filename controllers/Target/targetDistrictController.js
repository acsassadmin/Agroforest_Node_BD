const db = require("../../db");
const jwt = require("jsonwebtoken");

const formatToDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toISOString().split("T")[0];
};

// ===================== CREATE TARGET DISTRICT =====================
// ===================== CREATE TARGET DISTRICT =====================
exports.createTargetDistrict = async (req, res) => {
    try {
        const { target_department_id, district_id, target_quantity, start_date, end_date, status, created_by, scheme_type, scheme_id } = req.body;
        
        if (!district_id || target_quantity === undefined || !start_date || !end_date || !created_by) {
            return res.status(400).json({ message: "all fields are required" });
        }
        if (scheme_type === "Scheme" && !scheme_id) {
            return res.status(400).json({ message: "Scheme ID is required when Scheme type is selected" });
        }
        
        const finalStartDate = formatToDate(start_date);
        const finalEndDate = formatToDate(end_date);
        
        // ✅ UPDATED: Added scheme_type and scheme_id to the duplicate check
        let checkQuery = `
            SELECT * FROM target_district 
            WHERE target_department_id = ? 
              AND district_id = ? 
              AND scheme_type = ? 
              AND ((? BETWEEN start_date AND end_date) OR (? BETWEEN start_date AND end_date))
        `;
        
        let checkParams = [
            target_department_id, 
            district_id, 
            scheme_type || "Non-Scheme", 
            finalStartDate, 
            finalEndDate
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
            return res.status(400).json({ message: "Target already exists in this date range for this scheme/type" });
        }
        
        const [result] = await db.query(
            `INSERT INTO target_district (target_department_id, district_id, target_quantity, start_date, end_date, status, created_by, scheme_type, scheme_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [target_department_id, district_id, target_quantity, finalStartDate, finalEndDate, status || 'Active', created_by, scheme_type || "Non-Scheme", scheme_id || null]
        );
        
        res.status(201).json({ message: "Target District created successfully", target_id: result.insertId });
    } catch (err) {
        console.error("Create Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET ALL TARGET DISTRICTS =====================
// ===================== GET ALL TARGET DISTRICTS =====================
exports.getAllTargetDistricts = async (req, res) => {
    try {
        let userId = req.user?.id;
        let uDeptId = null;
        let uDistId = null;
        let isSuperUser = false;

        // 1. Extract User ID from Token (Fallback)
        if (!userId) {
            try {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.startsWith("Bearer ")) {
                    const token = authHeader.split(" ")[1];
                    const decoded = jwt.decode(token);
                    userId = decoded?.id || decoded?.userId;
                }
            } catch (e) { /* ignore */ }
        }

        // 2. Fetch User Role, Department, and District
        if (userId) {
            const [userRow] = await db.query(
                `SELECT department_id, district_id, is_superuser FROM users_customuser WHERE id = ?`, 
                [userId]
            );
            if (userRow.length > 0) {
                uDeptId = userRow[0].department_id;
                uDistId = userRow[0].district_id; // ✅ New: Capture district_id
                isSuperUser = userRow[0].is_superuser;
            }
        }

        let department_name = "Unknown";
        let department_total_target = 0;

        // 3. Fetch Department Details (Only if user belongs to a department)
        if (uDeptId) {
            const [deptRow] = await db.query(`SELECT * FROM department WHERE id = ?`, [uDeptId]);
            if (deptRow.length > 0) {
                department_name = deptRow[0].department_name || deptRow[0].Department_Name || "Unknown Department";
            }
            const [deptTarget] = await db.query(`SELECT target_quantity FROM target_department WHERE department_id = ?`, [uDeptId]);
            if (deptTarget.length > 0) {
                department_total_target = Number(deptTarget[0].target_quantity) || 0;
            }
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Base Query
        let countQuery = `SELECT COUNT(*) as total FROM target_district td`;
        let dataQuery = `
            SELECT td.id, td.target_department_id, td.target_quantity, td.start_date, td.end_date, 
                   td.status, td.scheme_type, md.District_Name AS district_name,
                   uc.username AS created_by_name, s.name AS scheme_name
            FROM target_district td
            JOIN master_district md ON td.district_id = md.id
            LEFT JOIN users_customuser uc ON td.created_by = uc.id
            LEFT JOIN tn_schema s ON td.scheme_id = s.id
        `;

        const params = [];
        const countParams = [];
        let whereClauses = [];

        // ✅ 4. LOGIC: Filter by District OR Department
        // If user has a district_id (District Admin), show ONLY that district
        if (uDistId) {
            whereClauses.push("td.district_id = ?");
            params.push(uDistId);
            countParams.push(uDistId);
        } 
        // If not a district admin but has a department_id, filter by department
        else if (uDeptId) {
            whereClauses.push("td.target_department_id = ?");
            params.push(uDeptId);
            countParams.push(uDeptId);
        }

        // Apply WHERE clauses to queries
        if (whereClauses.length > 0) {
            const whereStr = " WHERE " + whereClauses.join(" AND ");
            dataQuery += whereStr;
            countQuery += whereStr;
        }

        // 5. Pagination and Execution
        const [countRows] = await db.query(countQuery, countParams);
        const total = countRows[0].total;

        dataQuery += " ORDER BY td.id DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const [rows] = await db.query(dataQuery, params);

        res.status(200).json({
            data: rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
            user_department_name: department_name,
            department_total_target: department_total_target,
            user_district_id: uDistId // ✅ Help frontend know user is a Dist Admin
        });
    } catch (err) {
        console.error("Get All Error:", err);
        res.status(500).json({ error: err.message });
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