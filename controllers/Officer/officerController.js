const db = require("../../db");
const bcrypt = require("bcrypt");
// ===================== OFFICER =====================

// Get all officers
exports.getOfficers = async (req, res) => {
    try {
        // We use LEFT JOINs to get the names from related tables.
        // We also use CASE to convert Gender ID (1/2) to String (Male/Female).
        
        const query = `
    SELECT 
        od.id,
        od.\`officer name\` as officerName,
        
        -- Convert Gender ID to Name
        CASE od.Gender 
            WHEN 1 THEN 'Male' 
            WHEN 2 THEN 'Female' 
            ELSE 'Other' 
        END as gender,
        
        od.Mobile as mobile,
        od.Email as email,
        
        -- Get Names from related tables
        d.name as department,
        des.name as designation,
        r.name as role,
        u.username as username,

        -- 1. Get the creation timestamp
        od.created_at,

        -- 2. Get the Creator's Name 
        -- We assume 'created_by' in officer_details holds the ID of the user who created it.
        -- We join users_customuser again with an alias 'creator' to fetch their username.
        creator.username as created_by
       
    FROM officer_details od
    
    LEFT JOIN department d ON od.Department = d.id
    LEFT JOIN designation des ON od.Designation = des.id
    LEFT JOIN users_role r ON od.role = r.id
    LEFT JOIN users_customuser u ON od.Username = u.id
    
    -- 3. New Join: Link the 'created_by' ID to the users table to get the name
    LEFT JOIN users_customuser creator ON od.created_by = creator.id
`;
        const [officers] = await db.query(query);
        
        res.json(officers);
        
    } catch (err) {
        console.error("Get Officers Error:", err);
        res.status(500).json({
            error: err.message
        });
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




// Update officer details
exports.updateOfficer = async (req, res) => {
    try {
        const {
            id
        } = req.params;
        const {
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            role,
            username
        } = req.body;

        const updateQuery = `
            UPDATE officer_details 
            SET officername = ?, gender = ?, mobile = ?, email = ?, department = ?, designation = ?, role = ?, username = ?
            WHERE id = ?`;

        const [result] = await db.query(updateQuery, [
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            role,
            username,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Officer not found"
            });
        }

        res.json({
            message: "Officer updated"
        });
    } catch (err) {
        console.error("Update Officer Error:", err);
        res.status(500).json({
            error: err.message
        });
    }
};

// Delete an officer
exports.deleteOfficer = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        const deleteQuery = 'DELETE FROM officer_details WHERE id = ?';
        const [result] = await db.query(deleteQuery, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Officer not found"
            });
        }

        res.json({
            message: "Officer deleted"
        });
    } catch (err) {
        console.error("Delete Officer Error:", err);
        res.status(500).json({
            error: err.message
        });
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
            username,
            password,
            district_id,
            block_id
        } = req.body;

        // 1. Validation
        if (!username || !password || !email || !officername) {
            await connection.rollback();
            return res.status(400).json({ message: "Username, Password, Email, and Officer Name are required" });
        }

        // 2. Check if user already exists
        const [existingUser] = await connection.query(
            'SELECT id FROM users_customuser WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUser.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Username or Email already exists" });
        }

        // 3. Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Find Role ID
        let roleId = null;
        if (role) {
            const [roleRows] = await connection.query(
                'SELECT id FROM users_role WHERE id = ? OR name = ?',
                [role, role]
            );
            
            if (roleRows.length > 0) {
                roleId = roleRows[0].id; 
            } else {
                await connection.rollback();
                return res.status(400).json({ message: `Role '${role}' not found in database.` });
            }
        }

        // Gender Logic (1=Male, 2=Female, 3=Other)
        let genderValue = 3; 
        if (gender === 'Male') genderValue = 1;
        else if (gender === 'Female') genderValue = 2;
        
        // 5. Insert into users_customuser (Fixed is_superuser error)
        const insertUserQuery = `
            INSERT INTO users_customuser 
            (username, password, email, role_id, is_active, is_superuser, is_staff, date_joined) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const [userResult] = await connection.query(insertUserQuery, [
            username, 
            hashedPassword, 
            email, 
            roleId, 
            true,       // is_active
            false,      // is_superuser
            true,       // is_staff
            new Date()  // date_joined
        ]);

        const userId = userResult.insertId;

        // --- UPDATED: Insert into officer_details with created_at and created_by ---
        const insertOfficerQuery = `
            INSERT INTO officer_details
            (
                \`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, 
                \`Designation\`, \`role\`, \`Username\`, \`district_id\`, \`block_id\`, 
                \`created_at\`, \`created_by\`
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        await connection.query(insertOfficerQuery, [
            officername,
            genderValue, 
            mobile,
            email,
            department,
            designation,
            roleId, 
            userId,         // This is the 'Username' field in officer_details (User ID)
            district_id, 
            block_id,
            new Date(),     // created_at: Current timestamp
            req.user?.id    // created_by: ID of the logged-in user performing the action
        ]);

        await connection.commit();

        res.status(201).json({ 
            message: "Officer registered successfully", 
            user_id: userId 
        });

    } catch (err) {
        await connection.rollback();
        console.error("Register Officer Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};
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


