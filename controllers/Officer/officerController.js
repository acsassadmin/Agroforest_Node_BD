const db = require("../../db");
const bcrypt = require("bcrypt");

const redisClient = require('../../redisClient');


// Get all officers
exports.getOfficers = async (req, res) => {
    try {
        // --- STEP 1: Pagination Parameters ---
        // Default to page 1 and limit 10 if not provided
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // --- STEP 2: Redis Caching Key ---
        // Create a unique key based on the page and limit
        const cacheKey = `officers:page:${page}:limit:${limit}`;

        // --- STEP 3: Check Redis Cache ---
        try {
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                console.log(`Serving from Cache: ${cacheKey}`);
                return res.json(JSON.parse(cachedData));
            }
        } catch (redisError) {
            console.error("Redis Read Error:", redisError);
            // Continue to DB if Redis fails
        }

        // --- STEP 4: Database Query ---
        
        // A. Query to get the paginated data
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
            
            ORDER BY od.id DESC -- Optional: Good practice to order pagination results
            LIMIT ? OFFSET ?;
        `;

        // B. Query to get total count (required for frontend pagination UI)
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM officer_details od
            LEFT JOIN department d ON od.Department = d.id
            LEFT JOIN designation des ON od.Designation = des.id
            LEFT JOIN users_role r ON od.role = r.id
            LEFT JOIN users_customuser u ON od.Username = u.id
            LEFT JOIN master_district dist ON od.district_id = dist.id
            LEFT JOIN master_block block ON od.block_id = block.id
            LEFT JOIN users_customuser cb ON od.created_by = cb.id;
        `;

        // Execute both queries in parallel
        const [officersResult, countResult] = await Promise.all([
            db.query(dataQuery, [limit, offset]),
            db.query(countQuery)
        ]);

        const officers = officersResult[0];
        const totalItems = countResult[0][0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Construct the response object
        const responseData = {
            data: officers,
            pagination: {
                totalItems: totalItems,
                totalPages: totalPages,
                currentPage: page,
                itemsPerPage: limit
            }
        };

        // --- STEP 5: Store in Redis Cache ---
        try {
            // Cache for 1 hour (3600 seconds)
            await redisClient.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });
            console.log(`Cached data for: ${cacheKey}`);
        } catch (redisError) {
            console.error("Redis Write Error:", redisError);
        }

        res.json(responseData);

    } catch (err) {
        console.error("Get Officers Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};


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
            role, username, password, district_id, block_id,
            created_by, created_at // <--- New Fields
        } = req.body;

        if (!username || !password || !email || !officername) {
            await connection.rollback();
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Check existing user
        const [existingUser] = await connection.query(
            'SELECT id FROM users_customuser WHERE email = ? OR username = ?',
            [email, username]
        );
        if (existingUser.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

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
            (username, password, email, role_id, is_active, date_joined, is_superuser, first_name, last_name, department_id, district_id, block_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const [userResult] = await connection.query(insertUserQuery, [
            username, hashedPassword, email, roleId, true, new Date(), false, username, null,
            department, district_id, block_id
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
      officername,
      gender,
      mobile,
      email,
      department,
      designation,
      role,
      username,
      password          // optional
    } = req.body;

    // 1. Find officer_details row
    const [officerRows] = await connection.query(
      'SELECT id, Username FROM officer_details WHERE id = ?', [id]
    );
    if (!officerRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Officer not found" });
    }
    const officerDetail = officerRows[0];
    const userId = officerDetail.Username;

    // 2. Update officer_details
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
        \`Username\` = ?
      WHERE id = ?`;

    const genderValue = gender === 'Male' ? 1 : 0;
    const roleRow = await connection.query(
      'SELECT id FROM users_role WHERE name = ?', [role]
    );
    const roleId = roleRow[0]?.id || null;

    await connection.query(updateOfficerQuery, [
      officername,
      genderValue,
      mobile,
      email,
      department,
      designation,
      roleId,
      userId,
      id
    ]);

    // 3. Update users_customuser (optional: include password if sent)
    const updateUserQuery = `
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
      (await connection.query('SELECT district_id FROM officer_details WHERE id = ?', [id]))[0]?.district_id || null,
      (await connection.query('SELECT block_id FROM officer_details WHERE id = ?', [id]))[0]?.block_id || null,
      roleId,
      userId
    ];
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      userValues.splice(6, 0, hashedPassword); // insert before userId
    }

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

    const [officerRows] = await connection.query(
      'SELECT Username FROM officer_details WHERE id = ?', [id]
    );
    if (!officerRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Officer not found" });
    }
    const userId = officerRows[0].Username;

    // 1. Delete officer
    const deleteOfficerQuery = 'DELETE FROM officer_details WHERE id = ?';
    await connection.query(deleteOfficerQuery, [id]);

    // 2. Delete user (optional: soft delete instead with is_active = 0)
    const deleteUserQuery = 'DELETE FROM users_customuser WHERE id = ?';
    await connection.query(deleteUserQuery, [userId]);

    await connection.commit();

    res.json({ message: "Officer and user deleted" });

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
exports.getDesignations = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, name FROM designation ORDER BY id DESC"
        );

        // RETURN ONLY THE ARRAY.
        // Do not wrap it in { success: true, data: ... }
        res.json(rows);

    } catch (err) {
        console.error("Get Designations Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};

// CREATE designation
exports.createDesignation = async (req, res) => {
    try {
        const {
            name
        } = req.body;

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
};


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

// ===================== REGISTER OFFICER =====================

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


