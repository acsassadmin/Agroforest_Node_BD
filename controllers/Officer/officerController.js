const db = require("../../db");
const bcrypt = require("bcrypt");
// ===================== OFFICER =====================

// Get all officers
exports.getOfficers = async (req, res) => {
    try {
        const [officers] = await db.query('SELECT * FROM officer_details');
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

        const {
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            role,          // e.g., "Officer" (string)
            username,
            password
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

        // 4. Find Role ID from users_role table
        let roleId = null;
        if (role) {
            const [roleRows] = await connection.query(
                'SELECT id FROM users_role WHERE name = ?',
                [role]
            );
            if (roleRows.length > 0) {
                roleId = roleRows[0].id; // Found the ID (e.g., 2)
            } else {
                // Handle case where role name doesn't exist
                await connection.rollback();
                return res.status(400).json({ message: `Role '${role}' not found in database.` });
            }
        }

        // 5. Insert into users_customuser
        const insertUserQuery = `
            INSERT INTO users_customuser 
            (username, password, email, role_id, is_active) 
            VALUES (?, ?, ?, ?, ?)`;
        
        const [userResult] = await connection.query(insertUserQuery, [
            username, 
            hashedPassword, 
            email, 
            roleId, 
            true
        ]);

        const userId = userResult.insertId;

        // 6. Insert into officer_details
        // NOTE: We insert 'roleId' (the number), not 'role' (the string)
        const insertOfficerQuery = `
            INSERT INTO officer_details
            (\`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, \`Designation\`, \`role\`, \`Username\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            
        await connection.query(insertOfficerQuery, [
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            roleId,  // <--- FIX: Send the ID number here, not the name string
            userId 
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


