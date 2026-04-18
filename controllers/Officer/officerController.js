const db = require("../../db");
const bcrypt = require("bcrypt");
// ===================== OFFICER =====================

const redisClient = require('../../redisClient');

// Helper function to format JS Date to MySQL DATETIME
// Helper function to format date for MySQL (assuming this wasn't imported, defining it here to be safe)
const toMySQLDatetime = (date) => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
};
// --- GET OFFICER BY ID (For Edit) ---
exports.getOfficerById = async (req, res) => {
    try {
        const { id } = req.params;

        // SQL Query remains unchanged as requested
        // It returns raw data: Mobile (Number), Gender (Number)
        const query = `
            SELECT 
                od.id,
                od.\`officer name\` AS officerName,
                od.Gender,
                od.Mobile AS mobile,
                od.Email AS email,
                d.id AS department,
                d.name AS departmentName,
                des.id AS designation,
                des.name AS designationName,
                r.id AS role,
                r.name AS roleName,
                dist.id AS district_id,
                dist.District_Name AS districtName,
                block.id AS block_id,
                block.Block_Name AS blockName
            FROM officer_details od
            LEFT JOIN department d ON od.Department = d.id
            LEFT JOIN designation des ON od.Designation = des.id
            LEFT JOIN users_role r ON od.role = r.id
            LEFT JOIN master_district dist ON od.district_id = dist.id
            LEFT JOIN master_block block ON od.block_id = block.id
            WHERE od.id = ?
        `;

        const [rows] = await db.query(query, [id]);

        if (!rows.length) {
            return res.status(404).json({ message: "Officer not found" });
        }

        // We return the raw data. The Frontend will handle the Number -> String conversion.
        res.json(rows[0]);
    } catch (err) {
        console.error("Get Officer By ID Error:", err);
        res.status(500).json({ error: err.message });
    }
};
// --- GET ALL OFFICERS (List) ---
exports.getOfficers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const roleIdFilter = req.query.role_id; 

        let whereClause = '';
        const queryParams = [];

        if (roleIdFilter) {
            whereClause = 'WHERE od.role = ?';
            queryParams.push(roleIdFilter);
        }

        // Query remains unchanged
        const dataQuery = `
            SELECT 
                od.id,
                od.\`officer name\` AS officerName,
                od.Gender,
                u.phone AS mobile,
                od.Email AS email,
                d.name AS department,
                des.name AS designation,
                r.name AS role,
                u.username AS username,
                u.id AS userId,
                dist.District_Name AS districtName,
                block.Block_Name AS blockName,
                cb.username AS createdBy,
                od.created_at AS createdAt
            FROM officer_details od
            LEFT JOIN department d ON od.Department = d.id
            LEFT JOIN designation des ON od.Designation = des.id
            LEFT JOIN users_role r ON od.role = r.id
            LEFT JOIN users_customuser u ON od.Username = u.id
            LEFT JOIN master_district dist ON od.district_id = dist.id
            LEFT JOIN master_block block ON od.block_id = block.id
            LEFT JOIN users_customuser cb ON od.created_by = cb.id
            ${whereClause}
            ORDER BY od.id DESC
            LIMIT ? OFFSET ?;
        `;

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM officer_details od
            ${whereClause}
        `;

        const dataParams = [...queryParams, limit, offset];
        const countParams = [...queryParams];

        const [officersResult, countResult] = await Promise.all([
            db.query(dataQuery, dataParams),
            db.query(countQuery, countParams)
        ]);

        const officers = officersResult[0];
        const totalItems = countResult[0][0].total;
        const totalPages = Math.ceil(totalItems / limit);
        console.log(officers);
        
        // We format Gender/Mobile here only for the LIST view.
        // For the EDIT view, getOfficerById sends raw data.
        const formattedOfficers = officers.map(officer => ({
            ...officer,
            gender: officer.Gender == 1 ? 'Male' : (officer.Gender == 2 ? 'Female' : 'Other'),
            mobile: String(officer.mobile || '')
        }));
        
        res.json({
            data: formattedOfficers,
            pagination: {
                totalItems: totalItems,
                totalPages: totalPages,
                currentPage: page,
                itemsPerPage: limit
            }
        });

    } catch (err) {
        console.error("Get Officers Error:", err);
        res.status(500).json({ error: err.message });
    }
};
// --- REGISTER OFFICER ---
exports.registerOfficer = async (req, res) => {
    const connection = await db.getConnection(); 
    try {
        await connection.beginTransaction();

        const {
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            role,
            district_id,
            block_id,
            created_by,
            created_at
        } = req.body;

        // Only mobile is required for duplicate check
        if (!mobile) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false,
                message: "Mobile number is required" 
            });
        }
        
        // Check ONLY by mobile number (not email)
        const [existingUser] = await connection.query(
            'SELECT id, phone, email FROM users_customuser WHERE phone = ?',
            [mobile]
        );
        
        if (existingUser.length > 0) {
            await connection.rollback();
            return res.status(409).json({ 
                success: false,
                message: "Mobile number already registered. Please use a different number." 
            });
        }

        let roleId = null;
        if (role) {
            const [roleRows] = await connection.query(
                'SELECT id FROM users_role WHERE id = ? OR name = ?',
                [role, role]
            );
            if (roleRows.length > 0) roleId = roleRows[0].id;
        }

        // Gender: 1 for Male, 0 for Female/Other
        const genderValue = (gender === 'Male' || gender === 1) ? 1 : 0;
        const now = toMySQLDatetime(new Date());

        const insertUserQuery = `
            INSERT INTO users_customuser 
            (username, email, role_id, is_active, date_joined, is_superuser, is_staff, first_name, last_name, department_id, district_id, block_id, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const [userResult] = await connection.query(insertUserQuery, [
            officername, email, roleId, 1, now, 0, 0, officername, null, department, district_id, block_id, mobile
        ]);

        const userId = userResult.insertId;

        const insertOfficerQuery = `
            INSERT INTO officer_details
            (\`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, \`Designation\`, \`role\`, \`Username\`, \`district_id\`, \`block_id\`, \`created_by\`, \`created_at\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        await connection.query(insertOfficerQuery, [
            officername, genderValue, mobile, email, department, designation, roleId, userId, district_id, block_id, created_by || null, created_at ? toMySQLDatetime(new Date(created_at)) : now
        ]);

        await connection.commit();
        res.status(201).json({ 
            success: true,
            message: "Officer registered successfully", 
            user_id: userId 
        });

    } catch (err) {
        await connection.rollback();
        console.error("Registration Error:", err);
        
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
             return res.status(400).json({ 
                success: false,
                message: "Invalid Reference: Selected Department, Designation, Role, or District does not exist." 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: err.message 
        });
    } finally {
        connection.release();
    }
};
// --- UPDATE OFFICER ---
exports.updateOfficer = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      officername, gender, mobile, email, department, designation, role, district_id, block_id
    } = req.body;

    const [officerRows] = await connection.query(
      'SELECT Username FROM officer_details WHERE id = ?', [id]
    );
    if (!officerRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Officer not found" });
    }
    const userId = officerRows[0].Username;

    const [roleRows] = await connection.query(
        'SELECT id FROM users_role WHERE id = ? OR name = ?', [role, role]
    );
    const roleId = roleRows.length > 0 ? roleRows[0].id : null;

    // Gender Logic
    const genderValue = (gender === 'Male' || gender === 1) ? 1 : 0;

    const updateOfficerQuery = `
      UPDATE officer_details 
      SET \`officer name\` = ?, \`Gender\` = ?, \`Mobile\` = ?, \`Email\` = ?, \`Department\` = ?, \`Designation\` = ?, \`role\` = ?, \`district_id\` = ?, \`block_id\` = ?
      WHERE id = ?`;

    await connection.query(updateOfficerQuery, [
      officername, genderValue, mobile, email, department, designation, roleId, district_id || null, block_id || null, id
    ]);

    const updateUserQuery = `
      UPDATE users_customuser 
      SET username = ?, email = ?, department_id = ?, district_id = ?, block_id = ?, role_id = ?, phone = ?
      WHERE id = ?`;

    await connection.query(updateUserQuery, [
      officername, email, department, district_id || null, block_id || null, roleId, mobile, userId
    ]);

    await connection.commit();
    res.json({ message: "Officer updated successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("Update Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};
// --- DELETE OFFICER ---
exports.deleteOfficer = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        const [officerData] = await connection.query(
            'SELECT Username FROM officer_details WHERE id = ?', [id]
        );

        if (!officerData.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Officer not found" });
        }

        const userId = officerData[0].Username;

        await connection.query('DELETE FROM officer_details WHERE id = ?', [id]);

        if (userId) {
            await connection.query('DELETE FROM users_customuser WHERE id = ?', [userId]);
        }

        await connection.commit();
        res.json({ message: "Officer deleted successfully" });

    } catch (err) {
        await connection.rollback();
        console.error("Delete Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};
// GET all departments
exports.getDepartments = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, name FROM department ORDER BY id "
        );
        res.json(rows);
    } catch (err) {
        console.error("Get Departments Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};
// CREATE department
exports.createDepartment = async (req, res) => {
    try {
        const {
            name
        } = req.body;

        if (!name) {
            return res.status(400).json({
                message: "Department name is required"
            });
        }

        const [result] = await db.query(
            "INSERT INTO department (name) VALUES (?)",
            [name]
        );

        res.status(201).json({
            message: "Department created successfully",
            id: result.insertId,
            name
        });
    } catch (err) {
        console.error("Create Department Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};
// UPDATE department
exports.updateDepartment = async (req, res) => {
  try {
    // Get department ID from query parameter
    const { id } = req.query;
    const { name } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Department ID is required in query parameter" });
    }
    if (!name) {
      return res.status(400).json({ message: "New department name is required in request body" });
    }

    const [result] = await db.query(
      "UPDATE department SET name = ? WHERE id = ?",
      [name, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({
      message: "Department updated successfully",
      id,
      name
    });
  } catch (err) {
    console.error("Update Department Error:", err);
    res.status(500).json({ error: err.message });
  }
};
// DELETE department
exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ message: "Department ID is required in query parameter" });
    }

    const [result] = await db.query(
      "DELETE FROM department WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({ message: "Department deleted successfully", id });
  } catch (err) {
    console.error("Delete Department Error:", err);
    res.status(500).json({ error: err.message });
  }
};
// ===================== DESIGNATIONS =====================
// GET all designations
exports.getDesignation = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    if (page < 1 || limit < 1) {
      return res.status(400).json({ success: false, message: "Invalid pagination values" });
    }

    const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM designation");
    const [rows] = await db.query("SELECT id, name FROM designation ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]);

    // include pagination meta if you want, otherwise return rows only (you previously asked to return array only)
    res.json(rows);
  } catch (err) {
    console.error("Get Designations Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
// CREATE designation
exports.createDesignation = async (req, res) => {
    try {
        const { name } = req.body || {};

        if (!name) {
            return res.status(400).json({
                message: "Designation name is required"
            });
        }

        const [result] = await db.query(
            "INSERT INTO designation (name) VALUES (?)",
            [name]
        );

        res.status(201).json({
            message: "Designation created successfully",
            id: result.insertId,
            name
        });
    } catch (err) {
        console.error("Create Designation Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};
// 
exports.updateDesignation = async (req, res) => {
    try {
        const { id } = req.query; // read id from query
        const { name } = req.body;

        if (!id) {
            return res.status(400).json({ message: "Designation id is required" });
        }
        if (!name) {
            return res.status(400).json({ message: "Designation name is required" });
        }

        const [result] = await db.query(
            "UPDATE designation SET name = ? WHERE id = ?",
            [name, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Designation not found" });
        }

        res.json({ message: "Designation updated successfully", id, name });
    } catch (err) {
        console.error("Update Designation Error:", err);
        res.status(500).json({ error: err.message });
    }
};
// 
exports.deleteDesignation = async (req, res) => {
    try {
        const { id } = req.query; // read id from query

        if (!id) {
            return res.status(400).json({ message: "Designation id is required" });
        }

        const [result] = await db.query(
            "DELETE FROM designation WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Designation not found" });
        }

        res.json({ message: "Designation deleted successfully", id });
    } catch (err) {
        console.error("Delete Designation Error:", err);
        res.status(500).json({ error: err.message });
    }
};
// ===================== GET USERNAMES =====================
exports.getUsernames = async (req, res) => {
    try {
        const [usernames] = await db.query('SELECT id, username FROM users_customuser'); // Adjust as per your database structure
        res.json(usernames);
    } catch (err) {
        console.error("Get Usernames Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};
// exports.assignInspection = async (req, res) => {

//   try {
//     const {
//       orderid,
//       block_admin_id,
//       inspection_scheduled_date,
//       remarks
//     } = req.body;

//     console.log(orderid, block_admin_id, inspection_scheduled_date, remarks);

//     // 1️⃣ Basic validation
//     if (!orderid || !block_admin_id || !inspection_scheduled_date) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields"
//       });
//     }

//     // 2️⃣ Optional: Get farmer_id if exists
//     const [orderRows] = await db.execute(
//       `SELECT farmer_id FROM users_farmerrequest WHERE orderid = ?`,
//       [orderid]
//     );

//     const farmer_id = orderRows.length ? orderRows[0].farmer_id : null;

//     // 3️⃣ Insert into inspections table
//     const [result] = await db.execute(
//       `
//       INSERT INTO inspections
//       (order_id, farmer_id, block_admin_id, inspection_scheduled_date, remarks, completed_inspection_session)
//       VALUES (?, ?, ?, ?, ?, 0)
//       `,
//       [orderid, farmer_id, block_admin_id, inspection_scheduled_date, remarks || null]
//     );

//     // 4️⃣ Return success
//     return res.json({
//       success: true,
//       message: "Inspection assigned successfully",
//       inspection_id: result.insertId
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// };
//  Approve inspection
exports.approveInspection = async (req, res) => {
    try {
        const inspectionId = req.params.id;

        // 1. Find the LATEST pending upload for this inspection
        const [uploads] = await db.query(`
            SELECT id FROM inspection_uploads 
            WHERE inspection_id = ? AND verification_status = 'pending'
            ORDER BY id DESC LIMIT 1
        `, [inspectionId]);

        if (!uploads.length) {
            return res.status(404).json({ message: "No pending upload found for this inspection to approve." });
        }

        const uploadId = uploads[0].id;

        // ✅ FIX: Removed reason_for_reject = NULL
        await db.query(`
            UPDATE inspection_uploads 
            SET verification_status = 'approved' 
            WHERE id = ?
        `, [uploadId]);

        // 2. Calculate and update Next Inspection Date (+3 months)
        const [inspections] = await db.query(`SELECT inspection_scheduled_date FROM inspections WHERE id = ?`, [inspectionId]);
        if (inspections.length > 0) {
            const scheduledDate = new Date(inspections[0].inspection_scheduled_date);
            scheduledDate.setMonth(scheduledDate.getMonth() + 3); 
            const nextDate = scheduledDate.toISOString().split('T')[0];

            await db.query(`
                UPDATE inspections 
                SET next_inspection_date = ? 
                WHERE id = ?
            `, [nextDate, inspectionId]);
        }

        return res.json({ message: "Inspection approved successfully" });

    } catch (error) {
        console.error("Approve Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};
exports.rejectInspection = async (req, res) => {
    try {
        const inspectionId = req.params.id;
        const { reason_for_reject } = req.body; 
        console.log(reason_for_reject,inspectionId);
        
        // 1. Find the LATEST pending upload for this inspection
        const [uploads] = await db.query(`
            SELECT id FROM inspection_uploads 
            WHERE inspection_id = ? AND verification_status = 'pending'
            ORDER BY id DESC LIMIT 1
        `, [inspectionId]);

        if (!uploads.length) {
            return res.status(404).json({ message: "No pending upload found for this inspection to reject." });
        }

        const uploadId = uploads[0].id;

        // ✅ FIX: Removed reason_for_reject = ? from the query
        await db.query(`
            UPDATE inspection_uploads
            SET verification_status = 'rejected'
            WHERE id = ?
        `, [uploadId]);

        // 2. Clear the next_inspection_date since it was rejected
        await db.query(`
            UPDATE inspections 
            SET next_inspection_date = NULL 
            WHERE id = ?
        `, [inspectionId]);

        // 3. Add rejection remark to the main inspection table (This is where the reason is safely saved!)
        const [inspRows] = await db.query(`SELECT remarks FROM inspections WHERE id = ?`, [inspectionId]);
        if (inspRows.length > 0) {
            const oldRemarks = inspRows[0].remarks || "";
            const rejectRemark = `Rejected on ${new Date().toISOString().split('T')[0]}. Reason: ${reason_for_reject || 'No reason provided'}.`;
            
            await db.query(`
                UPDATE inspections 
                SET remarks = ?
                WHERE id = ?
            `, [oldRemarks ? `${oldRemarks} | ${rejectRemark}` : rejectRemark, inspectionId]);
        }

        return res.json({ 
            message: "Inspection rejected successfully",
            reason_for_reject: reason_for_reject || null // Still sending it back to frontend so it can show the alert
        });

    } catch (error) {
        console.error("Reject Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};
// get farmers orders
exports.getFarmerOrders = async (req, res) => {
  try {
    const user_id = req.params.userid;
    const role = req.params.role;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = Number((page - 1) * limit) || 0; 
    console.log(user_id,role);
    
    const [userRows] = await db.execute(
      `SELECT district_id, block_id, department_id FROM users_customuser WHERE id = ?`,
      [user_id]
    );

    if (!userRows.length) return res.status(404).json({ message: "User not found" });
    const user = userRows[0];

    let baseSql = `
      FROM users_farmerrequest ufr
      LEFT JOIN users_customuser cu ON cu.id = ufr.farmer_id
      LEFT JOIN users_farmeraathardetails fad ON fad.user_id = cu.id
      LEFT JOIN master_district d ON d.id = fad.district_id
      LEFT JOIN master_block b ON b.id = fad.block_id
      LEFT JOIN master_village v ON v.id = fad.village_id
      LEFT JOIN productioncenter_productioncenter pc ON pc.id = ufr.production_center_id
      WHERE ufr.status = 'billed' AND ufr.type = 'scheme' AND ufr.payment_type = 'Free of Cost'
    `;
    let params = [];

    if (role === "district_admin") { baseSql += ` AND pc.district_id = ?`; params.push(user.district_id); }
    else if (role === "block_admin") { baseSql += ` AND pc.block_id = ?`; params.push(user.block_id); }
    else if (role === "department_admin") { baseSql += ` AND pc.department_id = ?`; params.push(user.department_id); }

    const [[countResult]] = await db.execute(`SELECT COUNT(DISTINCT ufr.id) as total ${baseSql}`, params);
    const totalRecords = countResult.total;
    const totalPages = Math.ceil(totalRecords / limit);

        // Notice the backticks and ${limit} ${offset} at the end instead of ? ?
    const [orders] = await db.execute(`
      SELECT ufr.id AS request_id, ufr.orderid, ufr.farmer_id, ufr.created_at,
        fad.farmer_name, fad.mobile_number, fad.address,
        fad.latitude AS farmer_latitude, fad.longitude AS farmer_longitude, 
        d.District_Name, b.Block_Name, v.village_name,
        pc.id AS production_center_id, pc.name_of_production_centre, pc.complete_address,
        pc.district_id AS pc_district_id, pc.block_id AS pc_block_id, pc.department_id AS pc_department_id
      ${baseSql} ORDER BY ufr.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `, params); // <-- Only pass params here, no limit/offset

    if (!orders.length) {
      return res.json({ success: true, total_records: totalRecords, total_pages: totalPages, current_page: page, data: [] });
    }

    // 1️⃣ Get Items
    const requestIds = orders.map(o => o.request_id);
    const [items] = await db.execute(`
      SELECT ufi.request_id, ufi.stock_id, ufi.final_quantity, ufi.scheme_id, ts.name AS scheme_name, t.name AS species_name, t.name_tamil AS species_name_tamil
      FROM users_farmerrequestitem ufi
      LEFT JOIN tn_schema ts ON ts.id = ufi.scheme_id
      LEFT JOIN tbl_agroforest_trees t ON t.id = ufi.species_id
      WHERE ufi.request_id IN (${requestIds.map(() => '?').join(',')})
    `, requestIds);

    const itemsMap = {}; 
    const schemeMap = {};
    items.forEach(i => {
      if (!itemsMap[i.request_id]) itemsMap[i.request_id] = [];
      itemsMap[i.request_id].push({ 
        request_id: i.request_id, stock_id: i.stock_id, final_quantity: i.final_quantity, 
        species_name: i.species_name, species_name_tamil: i.species_name_tamil 
      });
      if (!schemeMap[i.request_id] && i.scheme_id) schemeMap[i.request_id] = { id: i.scheme_id, name: i.scheme_name };
    });

    // 2️⃣ Get Block Admins
    const blockIds = [...new Set(orders.map(o => o.pc_block_id).filter(Boolean))];
    let blockAdminMap = {};
    if (blockIds.length) {
      const [admins] = await db.execute(`SELECT id, block_id, first_name, last_name FROM users_customuser WHERE role_id = 6 AND block_id IN (${blockIds.map(() => '?').join(',')})`, blockIds);
      admins.forEach(a => {
        if (!blockAdminMap[a.block_id]) blockAdminMap[a.block_id] = [];
        blockAdminMap[a.block_id].push({ id: a.id, name: `${a.first_name} ${a.last_name || ''}`.trim() });
      });
    }

    // 3️⃣ Inspections + Uploads (FULLY FIXED)
    let inspectionMap = {};

    if (requestIds.length) {
      // Uses request_id (Requires the ALTER TABLE command to be run!)
      const [inspections] = await db.execute(`
        SELECT * FROM inspections WHERE request_id IN (${requestIds.map(() => '?').join(',')})
      `, requestIds);
      
      const inspectionIds = inspections.map(i => i.id);
      let uploadMap = {};

      if (inspectionIds.length) {
        // ✅ FIX 1: Removed 'iu.reason_for_reject' from this SELECT statement
        const [uploads] = await db.execute(`
          SELECT iu.id, iu.inspection_id, iu.image, iu.inspection_address, iu.latitude, iu.longitude, iu.survey_count, iu.inspected_by, iu.verification_status,
                 cu.first_name, cu.last_name
          FROM inspection_uploads iu
          LEFT JOIN users_customuser cu ON cu.id = iu.inspected_by
          WHERE iu.inspection_id IN (${inspectionIds.map(() => '?').join(',')})
        `, inspectionIds);

        uploads.forEach(u => {
          if (!uploadMap[u.inspection_id]) uploadMap[u.inspection_id] = [];
          
          const imagePath = `https://192.168.1.37:3001/uploads/${u.image}`; 
          uploadMap[u.inspection_id].push({
            id: u.id, image: imagePath, inspection_address: u.inspection_address,
            latitude: u.latitude, longitude: u.longitude, survey_count: u.survey_count,
            inspected_by: u.inspected_by,
            inspected_by_name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
            verification_status: u.verification_status || 'pending',
            // ✅ FIX 2: Hardcoded empty string since the column doesn't exist in your DB
            reason_for_reject: "" 
          });
        });
      }

      // ✅ FIX 3: Maps using ins.request_id
      inspections.forEach(ins => {
        if (!inspectionMap[ins.request_id]) inspectionMap[ins.request_id] = [];
        inspectionMap[ins.request_id].push({
          id: ins.id, 
          farmer_id: ins.farmer_id, 
          block_admin_id: ins.block_admin_id,
          inspection_scheduled_date: ins.inspection_scheduled_date, 
          remarks: ins.remarks,
          completed_inspection_session: ins.completed_inspection_session,
          next_inspection_date: ins.next_inspection_date, 
          created_at: ins.created_at,
          uploads: uploadMap[ins.id] || []
        });
      });
    }

    // 4️⃣ Final Data Mapping
    const result = orders.map(order => ({
      order_id: order.orderid, 
      order_date: order.created_at, 
      scheme: schemeMap[order.request_id] || null,
      farmer: order.farmer_id ? { 
      id: order.farmer_id, name: order.farmer_name, mobile: order.mobile_number, address: order.address, 
      location: { district: order.District_Name, block: order.Block_Name, village: order.village_name,latitude: order.farmer_latitude,
      longitude: order.farmer_longitude } 
      } : null,
      production_center: order.production_center_id ? { 
        id: order.production_center_id, name: order.name_of_production_centre, address: order.complete_address, 
        district_id: order.pc_district_id, block_id: order.pc_block_id, department_id: order.pc_department_id 
      } : null,
      block_admins: blockAdminMap[order.pc_block_id] || [],
      
      // ✅ FIX 4: Maps using order.request_id
      inspections: inspectionMap[order.request_id] || [],
      
      items: itemsMap[order.request_id] || []
    }));
    
    return res.json({ 
      success: true, 
      total_records: totalRecords, 
      total_pages: totalPages, 
      current_page: page, 
      data: result 
    });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ message: "Server Error", err });
  }
};
// upload inspection
exports.uploadInspectionDetails = async (req, res) => {
  try {
    // Variable is named inspection_id here
    const { inspection_id, inspection_address, latitude, longitude, survey_count, inspected_by, sapplings } = req.body;

    if (!inspection_id) return res.status(400).json({ message: "Inspection ID is required" });
    
    // ⚠️ ENSURE YOU HAVE multer middleware on your route, otherwise req.file is undefined!
    if (!req.file || !req.file.filename) return res.status(400).json({ message: "No file uploaded" });

    const image = req.file.filename;

    // 1. Insert into inspection_uploads
     const sql = `INSERT INTO inspection_uploads 
      (inspection_id, image, reason_for_reject, inspection_address, latitude, longitude, survey_count, inspected_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    // ✅ FIXED: 3rd value is now '' instead of nothing
    const result = await db.query(sql, [
      inspection_id, 
      image, 
      '',  // <-- empty string for reason_for_reject
      inspection_address, 
      latitude, 
      longitude, 
      survey_count, 
      inspected_by
    ]);
    
    const uploadId = result[0].insertId;

    // 2. Parse sapplings JSON string from frontend
    let parsedSapplings = sapplings;
    if (typeof sapplings === 'string') {
      try { parsedSapplings = JSON.parse(sapplings); } catch (e) { parsedSapplings = null; }
    }

    // 3. Insert into inspection_sapplings
    if (parsedSapplings && Array.isArray(parsedSapplings)) {
      const sapplingValues = parsedSapplings.map(item => [uploadId, item.sapplingname, item.survey_count]);
      const sapplingSql = `INSERT INTO inspection_sapplings (upload_id, sappling_name, survey_count) VALUES ?`;
      await db.query(sapplingSql, [sapplingValues]);
    }

    // ✅ FIX: Changed inspectionId back to inspection_id
    const [inspRows] = await db.query(`SELECT inspection_scheduled_date, remarks FROM inspections WHERE id = ?`, [inspection_id]);

    if (inspRows.length > 0) {
      const originalDate = new Date(inspRows[0].inspection_scheduled_date);
      originalDate.setMonth(originalDate.getMonth() + 3); // +3 months
      const nextDate = originalDate.toISOString().split('T')[0]; 

      const oldRemarks = inspRows[0].remarks || "";
      const uploadRemark = `Inspection uploaded on ${new Date().toISOString().split('T')[0]} (${survey_count} saplings found).`;

      // ✅ FIX: Changed inspectionId back to inspection_id
      await db.query(
        `UPDATE inspections SET next_inspection_date = ?, remarks = ? WHERE id = ?`,
        [nextDate, oldRemarks ? `${oldRemarks} | ${uploadRemark}` : uploadRemark, inspection_id]
      );
    }

    return res.json({ message: "Upload successful", uploadId: uploadId });
  } catch (error) {
    console.error("Upload Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
// assign inspection
exports.assignInspection = async (req, res) => {
  try {
    const { orderid, block_admin_id, inspection_scheduled_date, remarks } = req.body;
    console.log(orderid, block_admin_id, inspection_scheduled_date, remarks);
    
    if (!orderid || !block_admin_id || !inspection_scheduled_date) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Get the actual request_id (ufr.id) using the orderid string
    const [orderRows] = await db.execute(
      `SELECT id, farmer_id FROM users_farmerrequest WHERE orderid = ?`,
      [orderid]
    );

    if (!orderRows.length) return res.status(404).json({ message: "Order not found" });
    
    const request_id = orderRows[0].id; // This is the crucial link!
    const farmer_id = orderRows[0].farmer_id;

    // Insert using the NEW columns you added
    const [result] = await db.execute(
      `INSERT INTO inspections 
      (request_id, farmer_id, block_admin_id, inspection_scheduled_date, remarks, completed_inspection_session)
      VALUES (?, ?, ?, ?, ?, 0)`,
      [request_id, farmer_id, block_admin_id, inspection_scheduled_date, remarks || null]
    );
      
    return res.json({
      success: true,                       
      message: "Inspection assigned successfully",
      inspection_id: result.insertId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
// get all schems
exports.getSchemes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // Increased limit for master data lists
    const offset = (page - 1) * limit;

    console.log("Fetching Schemes List");

    // 1. Base SQL
    // Since schemes are global (not filtered by district/block/role), we just select all
    const baseSql = `FROM tn_schema`;

    // 2. Pagination Count
    const [[countResult]] = await db.execute(`SELECT COUNT(*) as total ${baseSql}`);
    const totalRecords = countResult.total;
    const totalPages = Math.ceil(totalRecords / limit);

    // 3. Fetch Data
    // Getting ID, Name, and the other columns from your table description
    const [schemes] = await db.execute(`
      SELECT 
        id, 
        name, 
        percentage, 
        species_preferred
      ${baseSql} 
      ORDER BY id ASC 
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    // 4. Format Response
    const result = schemes.map(s => ({
      id: s.id,
      name: s.name,
      percentage: s.percentage,
      species_preferred: s.species_preferred
    }));

    return res.json({ 
      success: true, 
      total_records: totalRecords, 
      total_pages: totalPages, 
      current_page: page, 
      data: result 
    });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ message: "Server Error", err });
  }
};
// get production center
exports.getProductionCenters = async (req, res) => {
  try {
    const user_id = req.params.userid;
    const role = req.params.role;
    
    console.log("Fetching Production Centers for:", user_id, role);
    
    // 1. Get User Details to identify jurisdiction
    const [userRows] = await db.execute(
      `SELECT district_id, block_id, department_id FROM users_customuser WHERE id = ?`,
      [user_id]
    );

    if (!userRows.length) return res.status(404).json({ message: "User not found" });
    const user = userRows[0];

    // 2. Base Query
    // We LEFT JOIN the 'production_center_schemes' table to include assigned schemes
    let baseSql = `
      FROM productioncenter_productioncenter pc
      LEFT JOIN production_center_schemes pcs ON pc.id = pcs.production_center_id
      WHERE pc.status = 'approved' 
      AND pc.production_type = 'private' 
    `;
    
    // Grouping is required because of the Left Join with schemes
    let groupSql = ` GROUP BY pc.id `; 

    let params = [];

    // 3. Apply Role-Based Filtering
    if (role === "district_admin") { 
      baseSql += ` AND pc.district_id = ?`; 
      params.push(user.district_id); 
    } else if (role === "block_admin") { 
      baseSql += ` AND pc.block_id = ?`; 
      params.push(user.block_id); 
    } else if (role === "department_admin") { 
      baseSql += ` AND pc.department_id = ?`; 
      params.push(user.department_id); 
    }

    // 4. Fetch Data
    // FIX: Replaced 'contact_number' with 'contact_person' & 'mobile_number'
    // FIX: Removed 'email' as it doesn't exist in your DB
    const [centers] = await db.execute(`
      SELECT 
        pc.id, 
        pc.name_of_production_centre, 
        pc.complete_address,
        pc.production_center_code,
        pc.contact_person,
        pc.mobile_number,
        GROUP_CONCAT(pcs.scheme_id) as scheme_ids
      ${baseSql} 
      ${groupSql}
      ORDER BY pc.id DESC
    `, params);

    // 5. Format the result for the Frontend
    // Convert comma-separated string "1,2" to Array [1,2]
    const result = centers.map(pc => ({
      ...pc,
      scheme_ids: pc.scheme_ids ? pc.scheme_ids.split(',').map(Number) : []
    }));

    return res.json({ 
      success: true, 
      data: result 
    });

  } catch (err) {
    console.error("ERROR fetching production centers:", err);
    res.status(500).json({ message: "Server Error", err });
  }
};
// ============
exports.getAllSchemes = async (req, res) => {
  try {
    // Simple fetch of all active schemes
    const [schemes] = await db.execute(`
      SELECT id, name, percentage, species_preferred 
      FROM tn_schema 
      ORDER BY name ASC
    `);

    return res.json({ 
      success: true, 
      data: schemes 
    });

  } catch (err) {
    console.error("ERROR fetching schemes:", err);
    res.status(500).json({ message: "Server Error", err });
  }
};
// 
exports.assignSchemes = async (req, res) => {
  const connection = await db.getConnection(); 
  try {
    const { center_id, scheme_ids } = req.body;

    if (!center_id) {
      return res.status(400).json({ message: "Production Center ID is required" });
    }

    // Start Transaction (Ensures data integrity)
    await connection.beginTransaction();

    // 1. Remove all existing schemes for this center
    await connection.execute(
      `DELETE FROM production_center_schemes WHERE production_center_id = ?`,
      [center_id]
    );

    // 2. Insert new schemes if provided
    if (scheme_ids && scheme_ids.length > 0) {
      // Create bulk insert values: (center_id, scheme_id_1), (center_id, scheme_id_2)...
      const values = scheme_ids.map(schemeId => [center_id, schemeId]);
      
      // Insert multiple rows at once
      await connection.query(
        `INSERT INTO production_center_schemes (production_center_id, scheme_id) VALUES ?`,
        [values]
      );
    }

    await connection.commit(); // Commit changes

    return res.json({ 
      success: true, 
      message: "Schemes assigned successfully!" 
    });

  } catch (err) {
    await connection.rollback(); // Rollback on error
    console.error("ERROR assigning schemes:", err);
    res.status(500).json({ message: "Server Error", err });
  } finally {
    connection.release(); // Release connection back to pool
  }
};
// 
exports.getPrivateValidSchemes = async (req, res) => {
  try {
    // Get production_center_id from URL parameters
    const { id: production_center_id } = req.params;

    if (!production_center_id) {
      return res.status(400).json({ message: "Production Center ID is required" });
    }

    const sql = `
      SELECT DISTINCT 
        ts.id, 
        ts.name, 
        ts.percentage, 
        ts.species_preferred
      FROM tn_schema ts
      JOIN production_center_schemes pcs ON ts.id = pcs.scheme_id
      JOIN target_productioncenter tp ON ts.id = tp.scheme_id
      WHERE pcs.production_center_id = ?
        AND tp.productioncenter_id = ?
        AND tp.target_quantity > 0
      ORDER BY ts.name ASC
    `;

    // We pass the production_center_id twice for both joins
    const [schemes] = await db.execute(sql, [production_center_id, production_center_id]);

    return res.json({ 
      success: true, 
      data: schemes 
    });

  } catch (err) {
    console.error("Error fetching private valid schemes:", err);
    res.status(500).json({ message: "Server Error", err });
  }
};