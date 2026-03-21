const db = require("../../db"); // Make sure this path points to your db config

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
        const { officername, gender, mobile, email, department, designation, role, username } = req.body;

        const insertQuery = `
            INSERT INTO officer_details 
            (officername, gender, mobile, email, department, designation, role, username) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const [result] = await db.query(insertQuery, [
            officername,
            gender,
            mobile,
            email,
            department,
            designation,
            role,
            username
        ]);

        // After officer creation, send the populated dropdown data (departments, designations, usernames)
        const [departments] = await db.query('SELECT id, name FROM department');
        const [designations] = await db.query('SELECT id, name FROM designation');
        const [usernames] = await db.query('SELECT id, username FROM users_customuser');

        res.status(201).json({
            message: "Officer created",
            officer_id: result.insertId,
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

// ===================== GET DEPARTMENTS =====================
exports.getDepartments = async (req, res) => {
    try {
        const [departments] = await db.query('SELECT id, name FROM department'); 
        res.json(departments);
    } catch (err) {
        console.error("Get Departments Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== GET DESIGNATIONS =====================
exports.getDesignations = async (req, res) => {
    try {
        const [designations] = await db.query('SELECT id, name FROM designation'); 
        res.json(designations);
    } catch (err) {
        console.error("Get Designations Error:", err);
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