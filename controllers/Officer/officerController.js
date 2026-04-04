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



exports.registerOfficer = async (req, res) => {
    const connection = await db.getConnection(); 
    try {
        await connection.beginTransaction();

        const {
            officername, gender, mobile, email, department, designation,
            role, district_id, block_id,
            created_by, created_at // <--- New Fields
        } = req.body;

        console.log("mobile " , mobile)
        if ( !email || !officername) {
            await connection.rollback();
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Check existing user
        const [existingUser] = await connection.query(
            'SELECT id FROM users_customuser WHERE email = ?',
            [email]
        );
        if (existingUser.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: "User already exists" });
        }

        

        // Find Role ID
        let roleId = null;
        if (role) {
            const [roleRows] = await connection.query(
                'SELECT id FROM users_role WHERE id = ? OR name = ?',
                [role, role]
            );
            if (roleRows.length > 0) roleId = roleRows[0].id;
        }

        let genderValue = gender === 'Male' ? 1 : 0;

        // 1. Insert into users_customuser
        const insertUserQuery = `
            INSERT INTO users_customuser 
            (username, email, role_id, is_active, date_joined, is_superuser, first_name, last_name, department_id, district_id, block_id , phone) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?)`;
        
        const [userResult] = await connection.query(insertUserQuery, [
            officername, email, roleId, true, new Date(), false, officername, null,
            department, district_id, block_id , mobile
        ]);

        const userId = userResult.insertId;

        // 2. Insert into officer_details (Added created_by and created_at)
        const insertOfficerQuery = `
            INSERT INTO officer_details
            (\`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, \`Designation\`, \`role\`, \`Username\`, \`district_id\`, \`block_id\`, \`created_by\`, \`created_at\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        await connection.query(insertOfficerQuery, [
            officername, genderValue, mobile, email, department, designation,
            roleId, userId, district_id, block_id, 
            created_by || null, // <--- New Field
            created_at || new Date() // <--- New Field
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
      officername, gender, mobile, email, department, designation,
      role,       // Frontend sends the Role ID (e.g., 5)
      username,
      password,   // optional
      district_id, // Needed for users_customuser update
      block_id     // Needed for users_customuser update
    } = req.body;

    // 1. Find officer_details row to get the linked User ID
    const [officerRows] = await connection.query(
      'SELECT id, Username FROM officer_details WHERE id = ?', [id]
    );
    
    if (!officerRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Officer not found" });
    }
    
    const officerDetail = officerRows[0];
    const userId = officerDetail.Username;

    // 2. Prepare Data for officer_details
    const genderValue = gender === 'Male' ? 1 : 0; // 1 for Male, 0 for Female
    
    // FIX: Frontend sends Role ID directly. Use it directly. No need to query 'users_role' table.
    const roleId = role; 

    // Update officer_details
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
      roleId,      // The valid ID from frontend
      userId,
      district_id || null,
      block_id || null,
      id
    ]);

    // 3. Update users_customuser
    // We need to update the fields that sync between the two tables
    let updateUserQuery = `
      UPDATE users_customuser 
      SET 
        username = ?,
        email = ?,
        department_id = ?,
        district_id = ?,
        block_id = ?,
        role_id = ?
        ${password ? ', password = ?' : ''}
      WHERE id = ?`;

    const userValues = [
      username,
      email,
      department,
      district_id || null,
      block_id || null,
      roleId
    ];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      userValues.push(hashedPassword);
    }
    
    userValues.push(userId); // WHERE id = ?

    await connection.query(updateUserQuery, userValues);

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
            "SELECT id, name FROM department ORDER BY id DESC"
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
};exports.deleteDesignation = async (req, res) => {
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

// ===================== REGISTER OFFICER =====================
// exports.registerOfficer = async (req, res) => {
//     const connection = await db.getConnection(); 
//     try {
//         await connection.beginTransaction();

//         const {
//             officername,
//             gender,
//             mobile,
//             email,
//             department,
//             designation,
//             role,
//             username,
//             password,
//             district_id,
//             block_id
//         } = req.body;

//         // 1. Validation
//         if (!username || !password || !email || !officername) {
//             await connection.rollback();
//             return res.status(400).json({ message: "Username, Password, Email, and Officer Name are required" });
//         }

//         // 2. Check if user already exists
//         const [existingUser] = await connection.query(
//             'SELECT id FROM users_customuser WHERE email = ? OR username = ?',
//             [email, username]
//         );

//         if (existingUser.length > 0) {
//             await connection.rollback();
//             return res.status(400).json({ message: "Username or Email already exists" });
//         }

//         // 3. Hash the password
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // 4. Find Role ID
//         let roleId = null;
//         if (role) {
//             const [roleRows] = await connection.query(
//                 'SELECT id FROM users_role WHERE id = ? OR name = ?',
//                 [role, role]
//             );
            
//             if (roleRows.length > 0) {
//                 roleId = roleRows[0].id; 
//             } else {
//                 await connection.rollback();
//                 return res.status(400).json({ message: `Role '${role}' not found in database.` });
//             }
//         }

//         // Gender Logic (1=Male, 2=Female, 3=Other)
//         let genderValue = 3; 
//         if (gender === 'Male') genderValue = 1;
//         else if (gender === 'Female') genderValue = 2;
        
//         // 5. Insert into users_customuser (Fixed is_superuser error)
//         const insertUserQuery = `
//             INSERT INTO users_customuser 
//             (username, password, email, role_id, is_active, is_superuser, is_staff, date_joined) 
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
//         const [userResult] = await connection.query(insertUserQuery, [
//             username, 
//             hashedPassword, 
//             email, 
//             roleId, 
//             true,       // is_active
//             false,      // is_superuser
//             true,       // is_staff
//             new Date()  // date_joined
//         ]);

//         const userId = userResult.insertId;

//         // --- UPDATED: Insert into officer_details with created_at and created_by ---
//         const insertOfficerQuery = `
//             INSERT INTO officer_details
//             (
//                 \`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, 
//                 \`Designation\`, \`role\`, \`Username\`, \`district_id\`, \`block_id\`, 
//                 \`created_at\`, \`created_by\`
//             )
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
//         await connection.query(insertOfficerQuery, [
//             officername,
//             genderValue, 
//             mobile,
//             email,
//             department,
//             designation,
//             roleId, 
//             userId,         // This is the 'Username' field in officer_details (User ID)
//             district_id, 
//             block_id,
//             new Date(),     // created_at: Current timestamp
//             req.user?.id    // created_by: ID of the logged-in user performing the action
//         ]);

//         await connection.commit();

//         res.status(201).json({ 
//             message: "Officer registered successfully", 
//             user_id: userId 
//         });

//     } catch (err) {
//         await connection.rollback();
//         console.error("Register Officer Error:", err);
//         res.status(500).json({ error: err.message });
//     } finally {
//         connection.release();
//     }
// };
// // Update officer details
// exports.updateOfficer = async (req, res) => {
//     try {
//         const {
//             id
//         } = req.params;
//         const {
//             officername,
//             gender,
//             mobile,
//             email,
//             department,
//             designation,
//             role,
//             username
//         } = req.body;

//         const updateQuery = `
//             UPDATE officer_details 
//             SET officername = ?, gender = ?, mobile = ?, email = ?, department = ?, designation = ?, role = ?, username = ?
//             WHERE id = ?`;

//         const [result] = await db.query(updateQuery, [
//             officername,
//             gender,
//             mobile,
//             email,
//             department,
//             designation,
//             role,
//             username,
//             id
//         ]);

//         if (result.affectedRows === 0) {
//             return res.status(404).json({
//                 message: "Officer not found"
//             });
//         }

//         res.json({
//             message: "Officer updated"
//         });
//     } catch (err) {
//         console.error("Update Officer Error:", err);
//         res.status(500).json({
//             error: err.message
//         });
//     }
// };

// // Delete an officer
// exports.deleteOfficer = async (req, res) => {
//     try {
//         const {
//             id
//         } = req.params;

//         const deleteQuery = 'DELETE FROM officer_details WHERE id = ?';
//         const [result] = await db.query(deleteQuery, [id]);

//         if (result.affectedRows === 0) {
//             return res.status(404).json({
//                 message: "Officer not found"
//             });
//         }

//         res.json({
//             message: "Officer deleted"
//         });
//     } catch (err) {
//         console.error("Delete Officer Error:", err);
//         res.status(500).json({
//             error: err.message
//         });
//     }
// };

// // GET all departments
// exports.getDepartments = async (req, res) => {
//     try {
//         const [rows] = await db.query(
//             "SELECT id, name FROM department ORDER BY id DESC"
//         );
//         res.json(rows);
//     } catch (err) {
//         console.error("Get Departments Error:", err);
//         res.status(500).json({
//             error: err.message
//         });
//     }
// };

// // CREATE department
// exports.createDepartment = async (req, res) => {
//     try {
//         const {
//             name
//         } = req.body;

//         if (!name) {
//             return res.status(400).json({
//                 message: "Department name is required"
//             });
//         }

//         const [result] = await db.query(
//             "INSERT INTO department (name) VALUES (?)",
//             [name]
//         );

//         res.status(201).json({
//             message: "Department created successfully",
//             id: result.insertId,
//             name
//         });
//     } catch (err) {
//         console.error("Create Department Error:", err);
//         res.status(500).json({
//             error: err.message
//         });
//     }
// };


// // GET all designations
// exports.getDesignations = async (req, res) => {
//     try {
//         const [rows] = await db.query(
//             "SELECT id, name FROM designation ORDER BY id DESC"
//         );
//         res.json(rows);
//     } catch (err) {
//         console.error("Get Designations Error:", err);
//         res.status(500).json({
//             error: err.message
//         });
//     }
// };

// // CREATE designation
// exports.createDesignation = async (req, res) => {
//     try {
//         const {
//             name
//         } = req.body;

//         if (!name) {
//             return res.status(400).json({
//                 message: "Designation name is required"
//             });
//         }

//         const [result] = await db.query(
//             "INSERT INTO designation (name) VALUES (?)",
//             [name]
//         );

//         res.status(201).json({
//             message: "Designation created successfully",
//             id: result.insertId,
//             name
//         });
//     } catch (err) {
//         console.error("Create Designation Error:", err);
//         res.status(500).json({
//             error: err.message
//         });
//     }
// };

// // ===================== GET USERNAMES =====================
// exports.getUsernames = async (req, res) => {
//     try {
//         const [usernames] = await db.query('SELECT id, username FROM users_customuser'); // Adjust as per your database structure
//         res.json(usernames);
//     } catch (err) {
//         console.error("Get Usernames Error:", err);
//         res.status(500).json({
//             error: err.message
//         });
//     }
// };


