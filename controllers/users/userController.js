const db = require("../../db"); // Make sure this path points to your db config
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");

const sendOtpEmail = require('../../utils/mailer');
const redisClient = require('../../redisClient');

const cache = new NodeCache({ stdTTL: 180 }); 

// ===================== AUTH =====================

// REGISTER (SEND OTP)
exports.register = async (req, res) => {
    try {
        const { username, password, email, phone, role } = req.body;
        console.log(username,"user" , password,"user" , email,"user" , phone,"user" , role);
        const [existingUsers] = await db.query('SELECT id FROM users_customuser WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        const userData = {
            username,
            email,
            password: hashedPassword,
            phone: phone || null,
            role_id: role,
            otp: otp
        };

        await redisClient.set(`register_${email}`, JSON.stringify(userData), { EX: 600 });
        await sendOtpEmail(email, otp);

        res.status(200).json({ 
            message: "OTP sent to email", 
            otp: otp 
        });

    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// VERIFY OTP
exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const cachedDataString = await redisClient.get(`register_${email}`);

        if (!cachedDataString) {
            return res.status(400).json({ message: 'OTP expired or invalid request. Please register again.' });
        }

        const cachedData = JSON.parse(cachedDataString);

        if (cachedData.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        const insertQuery = `
            INSERT INTO users_customuser 
            (username, email, password, phone, role_id, is_active) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        await db.query(insertQuery, [
            cachedData.username,
            cachedData.email,
            cachedData.password,
            cachedData.phone,
            cachedData.role_id,
            true
        ]);
        console.log(cachedData.role_id , "roleeee")
        await redisClient.del(`register_${email}`);

        res.status(201).json({ message: "User registered successfully" });

    } catch (err) {
        console.error("Verify OTP Error:", err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'User already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
};

// LOGIN
// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Query with JOINs to get Role Name and Production Center ID
    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.password,
        u.role_id,
        r.name as role_name,
        pc.id as production_center_id
      FROM users_customuser u
      LEFT JOIN users_role r ON u.role_id = r.id
      LEFT JOIN productioncenter_productioncenter pc ON pc.created_by_id = u.id
      WHERE u.email = ?
    `;

    const [users] = await db.query(query, [email]);

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];

    // 2. Compare Password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: "Wrong password" });
    }

    // --- Define Secrets (Ideally use process.env) ---
    const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
    const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

    // 3. Generate Access Token (Short lived: e.g., 15 mins)
    const accessToken = jwt.sign(
      { id: user.id, role: user.role_name },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    
    // 5. Send Response (Matching Django structure)
    res.json({
      access: accessToken,
      refresh: refreshToken,
      user_id: user.id,
      role: user.role_name,             
      user_name: user.username,
      production_center_id: user.production_center_id || null 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// REFRESH TOKEN (Placeholder)
exports.refreshToken = async (req, res) => {
    res.status(501).json({ message: "Refresh token logic not implemented yet" });
};


// ===================== ROLE =====================

exports.getRoles = async (req, res) => {
  try {
    const [roles] = await db.query(
      `SELECT * FROM users_role`
    );
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { name } = req.body;
    await db.query(`INSERT INTO users_role (name) VALUES (?)`, [name]);
    res.json({ message: "Role created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { id } = req.query;
    const { name } = req.body;
    await db.query(`UPDATE users_role SET name = ? WHERE id = ?`, [name, id]);
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.query;
    await db.query(`DELETE FROM users_role WHERE id = ?`, [id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===================== FARMER AADHAR =====================

exports.createFarmer = async (req, res) => {
  try {
    const { 
      name, 
      mobile_number, 
      village, 
      aadhar_no, 
      land_panel_details, 
      species_preferred, // Array [1, 2]
      purpose, 
      type 
    } = req.body;

    // 1. Determine Prefix
    let prefix = '';
    if (type === 'farmer') {
      prefix = 'FAR';
    } else if (type === 'non-farmer') {
      prefix = 'NFAR';
    } else {
      return res.status(400).json({ error: "Invalid type. Must be 'farmer' or 'non-farmer'." });
    }

    // 2. Find last ID
    const [rows] = await db.query(
      `SELECT farmer_id FROM users_farmeraathardetails 
       WHERE farmer_id LIKE ? 
       ORDER BY id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    // 3. Calculate Next Number
    let nextNum = 1;
    if (rows.length > 0) {
      const lastId = rows[0].farmer_id;
      const numPart = lastId.replace(prefix, '');
      const lastNum = parseInt(numPart, 10);
      nextNum = lastNum + 1;
    }

    // 4. Format ID
    const paddedNum = String(nextNum).padStart(3, '0');
    const farmer_id = `${prefix}${paddedNum}`;

    // 5. Insert Query (Added created_at and updated_at)
    const insertQuery = `
      INSERT INTO users_farmeraathardetails 
      (farmer_id, name, mobile_number, village, aadhar_no, land_panel_details, species_preferred, purpose, type, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    await db.query(insertQuery, [
      farmer_id,
      name,
      mobile_number,
      village,
      aadhar_no,
      land_panel_details,
      JSON.stringify(species_preferred), 
      purpose,
      type
      // created_at and updated_at are handled by NOW() in the SQL string above
    ]);

    res.status(201).json({ 
      message: "Farmer created successfully", 
      farmer_id: farmer_id 
    });

  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Aadhar number already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
};

// controllers/users/userController.js

exports.getFarmerAadhar = async (req, res) => {
  try {
    const { aadhar_no } = req.query;

    // 1. Check if aadhar_no is provided in query params
    if (aadhar_no) {
      const [data] = await db.query(
        `SELECT * FROM users_farmeraathardetails WHERE aadhar_no = ?`,
        [aadhar_no]
      );

      // If specific aadhar not found
      if (!data.length) {
        return res.status(404).json({ error: "Farmer not found with this Aadhar number" });
      }

      // Return the single farmer object
      return res.json(data[0]);
    }

    // 2. If no aadhar_no provided, return ALL farmers
    const [allData] = await db.query(`SELECT * FROM users_farmeraathardetails`);
    
    return res.json(allData);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// ===================== FARMER REQUEST =====================

exports.farmerRequest = async (req, res) => {
  try {
    const { requested_species, ...data } = req.body;

    // Insert Request
    const [result] = await db.query(
      `INSERT INTO users_farmerrequest
       (farmer_id, name, mobile_number, village, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', NOW())`,
       [data.farmer_id, data.name, data.mobile_number, data.village]
    );

    const requestId = result.insertId;

    // Generate ORDER ID
    const orderId = `ORD${String(requestId).padStart(4, "0")}`;

    await db.query(
      `UPDATE users_farmerrequest SET orderid = ? WHERE id = ?`,
      [orderId, requestId]
    );

    // Insert Items
    for (let item of requested_species) {
      await db.query(
        `INSERT INTO users_farmerrequestitem
         (request_id, stock_id, requested_quantity, status, created_at)
         VALUES (?, ?, ?, 'pending', NOW())`,
         [requestId, item.species_id, item.saplings_requested]
      );
    }

    res.json({ message: "Request created", request_id: requestId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// RENAMED to match route 'approveItem'
exports.approveItem = async (req, res) => {
  try {
    const { action, item_id, approved_quantity } = req.body;

    if (action === "approve") {
      await db.query(
        `UPDATE users_farmerrequestitem
         SET approved_quantity=?, status='approved'
         WHERE id=?`,
         [approved_quantity, item_id]
      );
    } else if (action === "reject") {
      await db.query(
        `UPDATE users_farmerrequestitem
         SET status='rejected', approved_quantity=0
         WHERE id=?`,
         [item_id]
      );
    }

    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

