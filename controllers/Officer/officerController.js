const db = require("../../db"); 

// ===================== OFFICER =====================

// Get all officers
exports.getOfficers = async (req, res) => {
    try {
        const [officers] = await db.query('SELECT * FROM officer_details');
        res.json(officers);
    } catch (err) {
        console.error("Get Officers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Get officer by ID
exports.getOfficerById = async (req, res) => {
    try {
        const { id } = req.params;
        const [officer] = await db.query('SELECT * FROM officer_details WHERE id = ?', [id]);

        if (!officer.length) {
            return res.status(404).json({ message: "Officer not found" });
        }

        res.json(officer[0]);
    } catch (err) {
        console.error("Get Officer By ID Error:", err);
        res.status(500).json({ error: err.message });
    }
};



// ===================== OFFICER =====================

// Get all officers
exports.getOfficers = async (req, res) => {
    try {
        const [officers] = await db.query('SELECT * FROM officer_details');
        res.json(officers);
    } catch (err) {
        console.error("Get Officers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Get officer by ID
exports.getOfficerById = async (req, res) => {
    try {
        const { id } = req.params;
        const [officer] = await db.query('SELECT * FROM officer_details WHERE id = ?', [id]);

        if (!officer.length) {
            return res.status(404).json({ message: "Officer not found" });
        }

        res.json(officer[0]);
    } catch (err) {
        console.error("Get Officer By ID Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Create a new officer
exports.createOfficer = async (req, res) => {
    try {
        const {
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            role,
            username,  
            password  
        } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }

        // 1️⃣ Insert into users_customuser first
        const insertUserQuery = `
            INSERT INTO users_customuser (username, password)
            VALUES (?, ?)`;
        const [userResult] = await db.query(insertUserQuery, [username, password]);

        const userId = userResult.insertId; // <-- primary key from users_customuser

        // 2️⃣ Now insert into officer_details using this userId as Username foreign key
        const insertOfficerQuery = `
            INSERT INTO officer_details
            (\`officer name\`, \`Gender\`, \`Mobile\`, \`Email\`, \`Department\`, \`Designation\`, \`role\`, \`Username\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [officerResult] = await db.query(insertOfficerQuery, [
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            role,
            userId  // <-- link to the newly created user
        ]);

        // 3️⃣ Fetch dropdown data to return
        const [departments] = await db.query('SELECT id, name FROM department');
        const [designations] = await db.query('SELECT id, name FROM designation');
        const [usernames] = await db.query('SELECT id, username FROM users_customuser');

        res.status(201).json({
            message: "Officer and user created successfully",
            officer_id: officerResult.insertId,
            user_id: userId,
            departments,
            designations,
            usernames
        });

    } catch (err) {
        console.error("Create Officer Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Update officer details
exports.updateOfficer = async (req, res) => {
    try {
        const { id } = req.params;
        const { officername, gender, mobile, email, department, designation, role, username } = req.body;

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
            return res.status(404).json({ message: "Officer not found" });
        }

        res.json({ message: "Officer updated" });
    } catch (err) {
        console.error("Update Officer Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Delete an officer
exports.deleteOfficer = async (req, res) => {
    try {
        const { id } = req.params;

        const deleteQuery = 'DELETE FROM officer_details WHERE id = ?';
        const [result] = await db.query(deleteQuery, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Officer not found" });
        }

        res.json({ message: "Officer deleted" });
    } catch (err) {
        console.error("Delete Officer Error:", err);
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
};

// CREATE department
exports.createDepartment = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Department name is required" });
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
        res.json(rows);
    } catch (err) {
        console.error("Get Designations Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// CREATE designation
exports.createDesignation = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Designation name is required" });
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
        res.status(500).json({ error: err.message });
    }
};

// Update officer details
exports.updateOfficer = async (req, res) => {
    try {
        const { id } = req.params;
        const { officername, gender, mobile, email, department, designation, role, username } = req.body;

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
            return res.status(404).json({ message: "Officer not found" });
        }

        res.json({ message: "Officer updated" });
    } catch (err) {
        console.error("Update Officer Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Delete an officer
exports.deleteOfficer = async (req, res) => {
    try {
        const { id } = req.params;

        const deleteQuery = 'DELETE FROM officer_details WHERE id = ?';
        const [result] = await db.query(deleteQuery, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Officer not found" });
        }

        res.json({ message: "Officer deleted" });
    } catch (err) {
        console.error("Delete Officer Error:", err);
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
};

// CREATE department
exports.createDepartment = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Department name is required" });
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
        res.json(rows);
    } catch (err) {
        console.error("Get Designations Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// CREATE designation
exports.createDesignation = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Designation name is required" });
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
        res.status(500).json({ error: err.message });
    }
};