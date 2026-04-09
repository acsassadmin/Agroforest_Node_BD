const db = require("../../db");
const bcrypt = require("bcrypt");
// ===================== OFFICER =====================

const redisClient = require('../../redisClient');


// Get all officers
exports.getOfficers = async (req, res) => {
    try {
        // 1. Get Pagination and Filter params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // CHANGE: Expecting role_id from frontend
        const roleIdFilter = req.query.role_id; 

        // 2. Setup Filtering Condition
        let whereClause = '';
        const queryParams = [];

        if (roleIdFilter) {
            // Filter directly by the role ID column in officer_details
            whereClause = 'WHERE od.role = ?';
            queryParams.push(roleIdFilter);
        }

        // 3. Data Query
        // Note: I removed the comment that caused the syntax error
        const dataQuery = `
            SELECT 
                od.id,
                od.\`officer name\` AS officerName,
                
                CASE od.Gender 
                    WHEN 1 THEN 'Male' 
                    WHEN 2 THEN 'Female' 
                    ELSE 'Other' 
                END AS gender,
                
                od.Mobile AS mobile,
                od.Email AS email,
                
                d.name AS department,
                des.name AS designation,
                r.name AS role,
                u.username AS username,
                
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

        // 4. Count Query
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM officer_details od
            ${whereClause}
        `;

        // Prepare parameters
        const dataParams = [...queryParams, limit, offset];
        const countParams = [...queryParams];

        // Execute queries
        const [officersResult, countResult] = await Promise.all([
            db.query(dataQuery, dataParams),
            db.query(countQuery, countParams)
        ]);

        const officers = officersResult[0];
        const totalItems = countResult[0][0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // 5. Redis Caching
        const cacheKey = `officers:page:${page}:limit:${limit}:role:${roleIdFilter || 'all'}`;
        
        // (Optional: Check Redis cache here before querying DB if you want read-cache logic)
        
        try {
            // Store in cache
            await redisClient.set(cacheKey, JSON.stringify({
                data: officers,
                pagination: { totalItems, totalPages, currentPage: page, itemsPerPage: limit }
            }), { EX: 3600 });
        } catch (redisError) {
            console.error("Redis Write Error:", redisError);
        }

        res.json({
            data: officers,
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

// Get officer by ID
exports.getOfficerById = async (req, res) => {
    try {
        const {
            id
        } = req.params;
        const [officer] = await db.query('SELECT * FROM officer_details WHERE id = ?', [id]);

        if (!officer.length) {
            return res.status(404).json({
                message: "Officer not found"
            });
        }

        res.json(officer[0]);
    } catch (err) {
        console.error("Get Officer By ID Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};



// Helper function to format JS Date to MySQL DATETIME
function toMySQLDatetime(date) {
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

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

        // Check required fields
        if (!mobile ||!email) {
            await connection.rollback();
            return res.status(400).json({ message: "Mobile or email is required" });
        }

        // Check if user already exists
        const [existingUser] = await connection.query(
            'SELECT id FROM users_customuser WHERE phone = ?',
            [mobile]
        );
        if (existingUser.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: "User already exists" });
        }

        // Resolve Role ID
        let roleId = null;
        if (role) {
            const [roleRows] = await connection.query(
                'SELECT id FROM users_role WHERE id = ? OR name = ?',
                [role, role]
            );
            if (roleRows.length > 0) roleId = roleRows[0].id;
        }

        // Gender as boolean (Male = 1, Female/Other = 0)
        const genderValue = gender === 'Male' ? 1 : 0;

        // Insert into users_customuser
        const insertUserQuery = `
            INSERT INTO users_customuser 
            (username, email, role_id, is_active, date_joined, is_superuser, is_staff, first_name, last_name, department_id, district_id, block_id, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const now = toMySQLDatetime(new Date());

        const [userResult] = await connection.query(insertUserQuery, [
            officername,
            email,
            roleId,
            1,                  // is_active = true
            now,                // date_joined
            0,                  // is_superuser
            0,                  // is_staff
            officername,        // first_name
            null,               // last_name
            department,
            district_id,
            block_id,
            mobile
        ]);

        const userId = userResult.insertId;

        // Insert into officer_details
        const insertOfficerQuery = `
            INSERT INTO officer_details
            (\`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, \`Designation\`, \`role\`, \`Username\`, \`district_id\`, \`block_id\`, \`created_by\`, \`created_at\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        await connection.query(insertOfficerQuery, [
            officername,
            genderValue,
            mobile,
            email,
            department,
            designation,
            roleId,
            userId,
            district_id,
            block_id,
            created_by || null,
            created_at ? toMySQLDatetime(created_at) : now
        ]);

        await connection.commit();
        res.status(201).json({ message: "Officer registered", user_id: userId });

    } catch (err) {
        await connection.rollback();
        console.error("Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};

// Update officer (users_customuser + officer_details)
exports.updateOfficer = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      officername,
      gender,
      mobile,
      email,
      department,
      designation,
      role,          // Role ID from frontend
      district_id,   // for users_customuser
      block_id       // for users_customuser
    } = req.body;

    // 1. Find officer_details to get the linked User ID
    const [officerRows] = await connection.query(
      'SELECT id, Username FROM officer_details WHERE id = ?', [id]
    );
    if (!officerRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Officer not found" });
    }
    const officerDetail = officerRows[0];
    const userId = officerDetail.Username;

    // 2. Prepare data for officer_details
    const genderValue = gender === 'Male' ? 1 : 0;
    const roleId = role; // Use role ID directly from frontend

    const updateOfficerQuery = `
      UPDATE officer_details 
      SET 
        \`officer name\` = ?, 
        \`Gender\` = ?,
        \`Mobile\` = ?,
        \`Email\` = ?,
        \`Department\` = ?,
        \`Designation\` = ?,
        \`role\` = ?,
        \`Username\` = ?,
        \`district_id\` = ?,
        \`block_id\` = ?
      WHERE id = ?`;

    await connection.query(updateOfficerQuery, [
      officername,
      genderValue,
      mobile,
      email,
      department,
      designation,
      roleId,
      userId,
      district_id || null,
      block_id || null,
      id
    ]);

    // 3. Update users_customuser (no password, username = officername)
    const updateUserQuery = `
      UPDATE users_customuser 
      SET 
        username = ?,
        email = ?,
        department_id = ?,
        district_id = ?,
        block_id = ?,
        role_id = ?
      WHERE id = ?`;

    await connection.query(updateUserQuery, [
      officername,
      email,
      department,
      district_id || null,
      block_id || null,
      roleId,
      userId
    ]);

    await connection.commit();
    res.json({ message: "Officer updated successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("Update Officer Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};


exports.deleteOfficer = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 1. Find the User ID associated with this officer
    const [officerRows] = await connection.query(
      'SELECT Username FROM officer_details WHERE id = ?', [id]
    );
    
    if (!officerRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Officer not found" });
    }
    
    const userId = officerRows[0].Username;

    // 2. Delete from officer_details
    // This removes their specific officer permissions/data
    const deleteOfficerQuery = 'DELETE FROM officer_details WHERE id = ?';
    await connection.query(deleteOfficerQuery, [id]);

    // 3. SOFT DELETE the user (Update is_active to 0)
    // This prevents login but keeps their ID in history tables (like created_by)
    const softDeleteUserQuery = 'UPDATE users_customuser SET is_active = 0 WHERE id = ?';
    await connection.query(softDeleteUserQuery, [userId]);

    await connection.commit();

    res.json({ message: "Officer deleted and user deactivated successfully" });

  } catch (err) {
    await connection.rollback();
    console.error("Delete Officer Error:", err);
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
// getFarmerorders
exports.getFarmerOrders = async (req, res) => {
  try {
    const user_id = req.params.userid;
    const role = req.params.role;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const { sendEmail } = require('../../utils/mailer');

    exports.SendEmail = async (req, res) => {
        try {
            const {
                email , message , name , phone
            } = req.body;

            if (!email || !name || !message || !phone) {
                return res.status(400).json({
                    message: "all feilds is required"
                });
            }

            await sendEmail(email, message , name , phone)
            res.status(201).json({
                message: "mail send successfully",
                
            });
        } catch (err) {
            console.error("mail send Error:", err);
            res.status(500).json({
                error: err.message
            });
        }
    };


// ===================== REGISTER OFFICER =====================
// exports.registerOfficer = async (req, res) => {
//     const connection = await db.getConnection(); 
//     try {
//         await connection.beginTransaction();
    // 1️⃣ Get logged-in user
    const [userRows] = await db.execute(
      `SELECT district_id, block_id, department_id 
       FROM users_customuser 
       WHERE id = ?`,
      [user_id]
    );

    if (!userRows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRows[0];

    // 2️⃣ Base SQL (common)
    let baseSql = `
      FROM users_farmerrequest ufr
      LEFT JOIN farmer f ON f.farmer_id = ufr.farmer_id
      LEFT JOIN master_district d ON d.id = f.district_id
      LEFT JOIN master_block b ON b.id = f.block_id
      LEFT JOIN master_village v ON v.id = f.village_id
      LEFT JOIN tn_schema ts ON ts.id = ufr.scheme_id
      LEFT JOIN productioncenter_productioncenter pc
        ON pc.id = ufr.production_center_id
      WHERE ufr.status = 'billed'
        AND ufr.type = 'scheme'
        AND ufr.payment_type = 'Free of Cost'
    `;

    let params = [];

    // 3️⃣ Role filtering (ALL based on Production Center now)
    if (role === "district_admin") {
      // ✅ Match with PRODUCTION CENTER's district
      baseSql += ` AND pc.district_id = ?`;
      params.push(user.district_id);
    } else if (role === "block_admin") {
      // ✅ Match with PRODUCTION CENTER's block
      baseSql += ` AND pc.block_id = ?`;
      params.push(user.block_id);
    } else if (role === "department_admin") {
      // ✅ Match with PRODUCTION CENTER's department
      baseSql += `
        AND ufr.production_center_id IN (
          SELECT id FROM productioncenter_productioncenter 
          WHERE department_id = ?
        )
      `;
      params.push(user.department_id);
    }

    // 4️⃣ Total count
    const countSql = `SELECT COUNT(*) as total ${baseSql}`;
    const [[countResult]] = await db.execute(countSql, params);
    const totalRecords = countResult.total;
    const totalPages = Math.ceil(totalRecords / limit);

    // 5️⃣ Paginated orders
    const dataSql = `
      SELECT 
        ufr.id AS request_id,
        ufr.orderid,
        ufr.farmer_id,
        ufr.scheme_id,
        ufr.created_at,

        ts.name AS scheme_name,

        f.farmer_name,
        f.mobile_number,
        f.address,

        d.District_Name,
        b.Block_Name,
        v.village_name,

        pc.id AS production_center_id,
        pc.name_of_production_centre,
        pc.complete_address,
        pc.district_id AS pc_district_id,    -- ✅ Added this
        pc.block_id AS pc_block_id,
        pc.department_id AS pc_department_id

      ${baseSql}
      ORDER BY ufr.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [orders] = await db.execute(dataSql, [...params, limit, offset]);

    if (!orders.length) {
      return res.json({
        success: true,
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        data: []
      });
    }

    // 6️⃣ Items
    const requestIds = orders.map(o => o.request_id);
    const itemPlaceholders = requestIds.map(() => '?').join(',');

    const [items] = await db.execute(
      `
      SELECT 
        ufi.request_id,
        ufi.stock_id,
        ufi.final_quantity,
        t.name AS species_name,
        t.name_tamil AS species_name_tamil
      FROM users_farmerrequestitem ufi
      LEFT JOIN tbl_agroforest_trees t ON t.id = ufi.species_id
      WHERE ufi.request_id IN (${itemPlaceholders})
      `,
      requestIds
    );

    const itemsMap = {};
    items.forEach(i => {
      if (!itemsMap[i.request_id]) itemsMap[i.request_id] = [];
      itemsMap[i.request_id].push(i);
    });

    // 7️⃣ Block admins
    const blockIds = [...new Set(orders.map(o => o.pc_block_id).filter(Boolean))];
    let blockAdminMap = {};

    if (blockIds.length) {
      const placeholders = blockIds.map(() => '?').join(',');

      const [admins] = await db.execute(
        `SELECT id, block_id, first_name, last_name
         FROM users_customuser
         WHERE role_id = 6 AND block_id IN (${placeholders})`,
        blockIds
      );

      admins.forEach(a => {
        if (!blockAdminMap[a.block_id]) blockAdminMap[a.block_id] = [];
        blockAdminMap[a.block_id].push({
          id: a.id,
          name: `${a.first_name} ${a.last_name || ''}`.trim()
        });
      });
    }

    // 8️⃣ Inspections + uploads + saplings
    const orderIds = orders.map(o => o.orderid);
    let inspectionMap = {};

    if (orderIds.length) {
      const placeholders = orderIds.map(() => '?').join(',');

      const [inspections] = await db.execute(
        `SELECT * FROM inspections WHERE order_id IN (${placeholders})`,
        orderIds
      );

      if (inspections.length) {
        const inspectionIds = inspections.map(i => i.id);
        const uploadPlaceholders = inspectionIds.map(() => '?').join(',');

        const [uploads] = await db.execute(
          `SELECT * FROM inspection_uploads WHERE inspection_id IN (${uploadPlaceholders})`,
          inspectionIds
        );

        let uploadMap = {};
        let uploadIds = [];
        let inspectorIds = new Set();
        const baseUrl = `${req.protocol}://${req.get("host")}`;

        uploads.forEach(u => {
          uploadIds.push(u.id);
          if (u.inspected_by) inspectorIds.add(u.inspected_by);

          if (!uploadMap[u.inspection_id]) uploadMap[u.inspection_id] = [];

          uploadMap[u.inspection_id].push({
            id: u.id,
            verification_status: u.verification_status,
            image: u.image ? `${baseUrl}/uploads/${u.image}` : null,
            created_at: u.created_at,
            reason_for_reject:
              u.verification_status === "rejected"
                ? u.reason_for_reject
                : null,
            inspection_address: u.inspection_address,
            latitude: u.latitude,
            longitude: u.longitude,
            survey_count: u.survey_count,
            inspected_by: u.inspected_by,
            inspected_by_name: null,
            saplings: []
          });
        });

        // inspector names
        let inspectorMap = {};
        if (inspectorIds.size) {
          const ids = Array.from(inspectorIds);
          const placeholders = ids.map(() => '?').join(',');

          const [inspectors] = await db.execute(
            `SELECT id, first_name, last_name FROM users_customuser WHERE id IN (${placeholders})`,
            ids
          );

          inspectors.forEach(i => {
            inspectorMap[i.id] = `${i.first_name} ${i.last_name || ''}`.trim();
          });
        }

        // attach inspector names
        Object.keys(uploadMap).forEach(insId => {
          uploadMap[insId].forEach(u => {
            u.inspected_by_name = inspectorMap[u.inspected_by] || null;
          });
        });

        // saplings 
        let saplingMap = {};
        if (uploadIds.length) {
          const placeholders = uploadIds.map(() => '?').join(',');

          const [saplings] = await db.execute(
            `SELECT * FROM inspection_sapplings WHERE upload_id IN (${placeholders})`,
            uploadIds
          );

          saplings.forEach(s => {
            if (!saplingMap[s.upload_id]) saplingMap[s.upload_id] = [];
            saplingMap[s.upload_id].push({
              id: s.id,
              sapling_name: s.sappling_name,
              survey_count: s.survey_count
            });
          });
        }

        // attach saplings
        Object.keys(uploadMap).forEach(insId => {
          uploadMap[insId].forEach(u => {
            u.saplings = saplingMap[u.id] || [];
          });
        });

        // group inspections
        inspections.forEach(ins => {
          if (!inspectionMap[ins.order_id]) inspectionMap[ins.order_id] = [];

          inspectionMap[ins.order_id].push({
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
    }

    // 9️⃣ Final response
    const result = orders.map(order => ({
      order_id: order.orderid,
      order_date: order.created_at,

      scheme: {
        id: order.scheme_id,
        name: order.scheme_name
      },

      farmer: order.farmer_id
        ? {
            id: order.farmer_id,
            name: order.farmer_name,
            mobile: order.mobile_number,
            address: order.address,
            location: {
              district: order.District_Name,
              block: order.Block_Name,  
              village: order.village_name
            }
          }
        : null,

      production_center: order.production_center_id
        ? {
            id: order.production_center_id,
            name: order.name_of_production_centre,
            address: order.complete_address,
            district_id: order.pc_district_id,    // ✅ Added this
            block_id: order.pc_block_id,
            department_id: order.pc_department_id
          }
        : null,

      block_admins: order.pc_block_id
        ? blockAdminMap[order.pc_block_id] || []
        : [],

      inspections: inspectionMap[order.orderid] || [],
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
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};
// assign inspection
exports.assignInspection = async (req, res) => {

  try {
    const {
      orderid,
      block_admin_id,
      inspection_scheduled_date,
      remarks
    } = req.body;

    console.log(orderid, block_admin_id, inspection_scheduled_date, remarks);

    // 1️⃣ Basic validation
    if (!orderid || !block_admin_id || !inspection_scheduled_date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // 2️⃣ Optional: Get farmer_id if exists
    const [orderRows] = await db.execute(
      `SELECT farmer_id FROM users_farmerrequest WHERE orderid = ?`,
      [orderid]
    );

    const farmer_id = orderRows.length ? orderRows[0].farmer_id : null;

    // 3️⃣ Insert into inspections table
    const [result] = await db.execute(
      `
      INSERT INTO inspections
      (order_id, farmer_id, block_admin_id, inspection_scheduled_date, remarks, completed_inspection_session)
      VALUES (?, ?, ?, ?, ?, 0)
      `,
      [orderid, farmer_id, block_admin_id, inspection_scheduled_date, remarks || null]
    );

    // 4️⃣ Return success
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
//  Approve inspection
exports.approveInspection = async (req, res) => {
    try {
        const inspectionId = req.params.id; 
        const { remarks } = req.body;

        // 1. Get latest upload for this inspection
        const [uploadResult] = await db.query(
            `SELECT * FROM inspection_uploads 
             WHERE inspection_id = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [inspectionId]
        );

        if (uploadResult.length === 0) {
            return res.status(404).json({ message: "Upload not found" });
        }

        const upload = uploadResult[0];

        // 2. Approve upload
        await db.query(
            `UPDATE inspection_uploads 
             SET verification_status = 'approved'
             WHERE id = ?`,
            [upload.id]
        );

        // 3. Get inspection
        const [inspResult] = await db.query(
            `SELECT * FROM inspections WHERE id = ?`,
            [inspectionId]
        );

        if (inspResult.length === 0) {
            return res.status(404).json({ message: "Inspection not found" });
        }

        const inspection = inspResult[0];

        let currentSession = inspection.completed_inspection_session || 0;
        let newSession = currentSession + 1;

        let nextDate = null;
        let message = "";

        if (newSession < 3) {
            let date = new Date();  
            date.setMonth(date.getMonth() + 3);
            nextDate = date.toISOString().split('T')[0];

            message = `Session ${newSession} completed. Next inspection scheduled.`;
        } else {
            message = `All 3 sessions completed.`;
        }

        // 4. Update inspection (remarks + reminder)
        await db.query(
            `UPDATE inspections
             SET remarks = ?,
                 completed_inspection_session = ?,
                 next_inspection_date = ?
             WHERE id = ?`,
            [remarks || null, newSession, nextDate, inspectionId]
        );
        
        return res.json({
            message,
            completed_session: newSession,
            next_inspection_date: nextDate,
            remarks: remarks || null
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
// reject inspection
exports.rejectInspection = async (req, res) => {
    try {
        const inspectionId = req.params.id;
        const { reason_for_reject } = req.body; 

        const sql = `
            UPDATE inspection_uploads
            SET 
                verification_status = 'rejected',
                reason_for_reject = ?
            WHERE id = ?
        `;

        const result = await db.query(sql, [
            reason_for_reject || null,
            inspectionId
        ]);

        if (result.affectedRows === 0) {    
            return res.status(404).json({ message: "Upload not found" });
        }

        return res.json({ 
            message: "Inspection rejected successfully",
            reason_for_reject: reason_for_reject || null
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
// upload inspection
exports.uploadInspectionDetails = async (req, res) => {
    try {
        const {
            inspection_id,
            inspection_address,
            latitude,
            longitude,
            survey_count,
            inspected_by,
            sapplings
        } = req.body;

        if (!inspection_id) {
            return res.status(400).json({ message: "Inspection ID is required" });
        }

        if (!req.file || !req.file.filename) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const image = req.file.filename;

        // Insert into main table
        const sql = `
            INSERT INTO inspection_uploads 
            (inspection_id, image, inspection_address, latitude, longitude, survey_count, inspected_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        // insert into main table
        const result = await db.query(sql, [
            inspection_id,
            image,
            inspection_address,
            latitude,
            longitude,
            survey_count,
            inspected_by
        ]);
   
      
        const uploadId = result[0].insertId;
       console.log("upload id",uploadId);
       
        // Insert sapplings (if provided)
        if (sapplings && Array.isArray(sapplings)) {
            const sapplingValues = sapplings.map(item => [
                uploadId,
                item.sapplingname, 
                item.survey_count   
            ]);

            const sapplingSql = ` 
                INSERT INTO inspection_sapplings (upload_id, sappling_name, survey_count)
                VALUES ?
            `;
            await db.query(sapplingSql, [sapplingValues]);
        }

        return res.json({
            message: "Upload successful",
            uploadId: uploadId
        });

<<<<<<< HEAD

=======
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
>>>>>>> 5f6e3893e1ffc9e3edc60d36078b6a12be094ecf
