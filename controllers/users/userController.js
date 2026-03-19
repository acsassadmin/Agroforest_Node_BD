const db = require("../../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const redisClient = require("../../redisClient"); // Redis client

// ===================== AUTH =====================

// REGISTER (SEND OTP)
exports.register = async (req, res) => {
  try {
    const { username, email, password, phone, role_id } = req.body;

    const [existing] = await db.promise().query(
      `SELECT * FROM users_customuser WHERE email = ?`,
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const cached = await redisClient.get(email);
    if (cached) return res.status(400).json({ error: "OTP already sent" });

    const otp = Math.floor(100000 + Math.random() * 900000);

    await redisClient.set(email, JSON.stringify({
      username,
      email,
      password,
      phone,
      role_id,
      otp
    }), { EX: 180 }); // 3 min TTL

    console.log("OTP:", otp);

    res.json({ message: "OTP sent", otp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// VERIFY OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const data = await redisClient.get(email);
    if (!data) return res.status(400).json({ error: "OTP expired" });

    const parsedData = JSON.parse(data);

    if (parsedData.otp != otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const hashed = await bcrypt.hash(parsedData.password, 10);

    await db.promise().query(
      `INSERT INTO users_customuser 
       (username, email, password, phone, role_id, date_joined)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [parsedData.username, parsedData.email, hashed, parsedData.phone, parsedData.role_id]
    );

    await redisClient.del(email); // remove OTP from Redis

    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [users] = await db.promise().query(
      `SELECT u.*, r.name as role_name
       FROM users_customuser u
       LEFT JOIN users_role r ON u.role_id = r.id
       WHERE u.email = ?`,
      [email]
    );

    const user = users[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign(
      { id: user.id, role: user.role_name },
      "SECRET",
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user_id: user.id,
      role: user.role_name,
      user_name: user.username
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===================== ROLE =====================

exports.getRoles = async (req, res) => {
  try {
    const cacheKey = "roles_list";
    const cachedRoles = await redisClient.get(cacheKey);

    if (cachedRoles) return res.json(JSON.parse(cachedRoles));

    const [roles] = await db.promise().query(`SELECT * FROM users_role`);

    await redisClient.set(cacheKey, JSON.stringify(roles), { EX: 300 }); // cache 5 min

    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { name } = req.body;

    await db.promise().query(
      `INSERT INTO users_role (name) VALUES (?)`,
      [name]
    );

    await redisClient.del("roles_list"); // clear roles cache

    res.json({ message: "Role created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { id } = req.query;

    await db.promise().query(
      `UPDATE users_role SET name=? WHERE id=?`,
      [req.body.name, id]
    );

    await redisClient.del("roles_list"); // clear roles cache

    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.query;

    await db.promise().query(
      `DELETE FROM users_role WHERE id=?`,
      [id]
    );

    await redisClient.del("roles_list"); // clear roles cache

    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===================== FARMER AADHAR =====================

exports.getFarmer = async (req, res) => {
  try {
    const { aadhar_no } = req.query;
    const cacheKey = `farmer_aadhar_${aadhar_no}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) return res.json(JSON.parse(cached));

    const [data] = await db.promise().query(
      `SELECT * FROM users_farmeraathardetails WHERE aadhar_no = ?`,
      [aadhar_no]
    );

    if (!data.length) return res.status(404).json({ error: "Not found" });

    await redisClient.set(cacheKey, JSON.stringify(data[0]), { EX: 300 }); // cache 5 min

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createFarmer = async (req, res) => {
  try {
    const f = req.body;

    await db.promise().query(
      `INSERT INTO users_farmeraathardetails
       (farmer_id, name, mobile_number, village, aadhar_no, land_panel_details, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [f.farmer_id, f.name, f.mobile_number, f.village, f.aadhar_no, f.land_panel_details]
    );

    await redisClient.del(`farmer_aadhar_${f.aadhar_no}`); // clear cache

    res.json({ message: "Created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateFarmer = async (req, res) => {
  try {
    const { id } = req.query;

    await db.promise().query(
      `UPDATE users_farmeraathardetails
       SET name=?, mobile_number=?, village=?, updated_at=NOW()
       WHERE id=?`,
      [req.body.name, req.body.mobile_number, req.body.village, id]
    );

    if (req.body.aadhar_no) {
      await redisClient.del(`farmer_aadhar_${req.body.aadhar_no}`);
    }

    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteFarmer = async (req, res) => {
  try {
    const { id, aadhar_no } = req.query;

    await db.promise().query(
      `DELETE FROM users_farmeraathardetails WHERE id=?`,
      [id]
    );

    if (aadhar_no) await redisClient.del(`farmer_aadhar_${aadhar_no}`);

    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===================== FARMER REQUEST =====================

exports.createRequest = async (req, res) => {
  try {
    const { requested_species, ...data } = req.body;

    const [result] = await db.promise().query(
      `INSERT INTO users_farmerrequest
       (farmer_id, name, mobile_number, village, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [data.farmer_id, data.name, data.mobile_number, data.village]
    );

    const requestId = result.insertId;

    const orderId = `ORD${String(requestId).padStart(4, "0")}`;

    await db.promise().query(
      `UPDATE users_farmerrequest SET orderid=? WHERE id=?`,
      [orderId, requestId]
    );

    for (let item of requested_species) {
      await db.promise().query(
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

exports.updateRequestItem = async (req, res) => {
  try {
    const { action, item_id, approved_quantity } = req.body;

    if (action === "approve") {
      await db.promise().query(
        `UPDATE users_farmerrequestitem
         SET approved_quantity=?, status='approved'
         WHERE id=?`,
        [approved_quantity, item_id]
      );
    }

    if (action === "reject") {
      await db.promise().query(
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