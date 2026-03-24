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
                
                -- Get Names from related tables using aliases
                d.name as department,
                des.name as designation,
                r.name as role,
                u.username as username
                
            FROM officer_details od
            
            -- Join with Departments Table (Assuming table name is 'departments')
            LEFT JOIN department d ON od.Department = d.id
            
            -- Join with Designations Table (Assuming table name is 'designations')
            LEFT JOIN designation des ON od.Designation = des.id
            
            -- Join with Roles Table
            LEFT JOIN users_role r ON od.role = r.id
            
            -- Join with Users Table to get the actual username string
            LEFT JOIN users_customuser u ON od.Username = u.id
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


// ===================== DESIGNATIONS =====================

// GET all designations
exports.getDesignations = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, name FROM designation ORDER BY id DESC"
        );
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
        console.log("--- Transaction Started ---");

        const {
            officername, gender, mobile, email, department, designation,
            role, username, password, district_id, block_id
        } = req.body;

        // 1. Validation
        // Added 'department' check since you are saving it now
        if (!username || !password || !email || !officername ) {
            await connection.rollback();
            return res.status(400).json({ message: "Username, Password, Email, Officer Name, and Department are required" });
        }

        // 2. Check existing user
        const [existingUser] = await connection.query(
            'SELECT id FROM users_customuser WHERE email = ? OR username = ?',
            [email, username]
        );
        if (existingUser.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: "User already exists" });
        }

        // 3. Hash password
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
                return res.status(400).json({ message: `Role not found` });
            }
        }

        let genderValue = gender === 'Male' ? 1 : 0;

        // --- UPDATED INSERT QUERY ---
        // Added department_id, district_id, block_id
        const insertUserQuery = `
            INSERT INTO users_customuser 
            (username, password, email, role_id, is_active, date_joined, is_superuser, first_name, last_name, department_id, district_id, block_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const [userResult] = await connection.query(insertUserQuery, [
            username, 
            hashedPassword, 
            email, 
            roleId, 
            true,
            new Date(),
            false,
            username,
            null,
            department,     // <--- Matches department_id
            district_id,    // <--- Matches district_id
            block_id        // <--- Matches block_id
        ]);

        console.log("Insert 1 SUCCESS. New User ID:", userResult.insertId);
        const userId = userResult.insertId;

        // 6. Insert into officer_details (Logic remains the same)
        const insertOfficerQuery = `
            INSERT INTO officer_details
            (\`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, \`Designation\`, \`role\`, \`Username\`, \`district_id\`, \`block_id\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        await connection.query(insertOfficerQuery, [
            officername, genderValue, mobile, email, department, designation,
            roleId, userId, district_id, block_id
        ]);
        
        console.log("Insert 2 SUCCESS.");

        await connection.commit();
        console.log("--- Transaction Committed Successfully ---");

        res.status(201).json({ message: "Officer registered", user_id: userId });

    } catch (err) {
        await connection.rollback();
        console.error("!!! ERROR CAUGHT !!! Rolling back transaction.", err);
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


