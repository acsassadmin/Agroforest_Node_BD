const db = require("../../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 180 }); // 3 min OTP

// ===================== AUTH =====================

// REGISTER (SEND OTP)
exports.register = async (req, res) => {
  try {
    const { username, email, password, phone, role_id } = req.body;

    const [existing] = await sequelize.query(
      `SELECT * FROM users_customuser WHERE email = :email`,
      { replacements: { email } }
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    if (cache.get(email)) {
      return res.status(400).json({ error: "OTP already sent" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    cache.set(email, {
      username,
      email,
      password,
      phone,
      role_id,
      otp
    });

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

    const data = cache.get(email);
    if (!data) return res.status(400).json({ error: "OTP expired" });

    if (data.otp != otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const hashed = await bcrypt.hash(data.password, 10);

    await sequelize.query(
      `INSERT INTO users_customuser 
       (username, email, password, phone, role_id, date_joined)
       VALUES (:username, :email, :password, :phone, :role_id, NOW())`,
      {
        replacements: {
          username: data.username,
          email: data.email,
          password: hashed,
          phone: data.phone,
          role_id: data.role_id
        }
      }
    );

    cache.del(email);

    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [users] = await sequelize.query(
      `SELECT u.*, r.name as role_name
       FROM users_customuser u
       LEFT JOIN users_role r ON u.role_id = r.id
       WHERE u.email = :email`,
      { replacements: { email } }
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
  const [roles] = await sequelize.query(`SELECT * FROM users_role`);
  res.json(roles);
};

exports.createRole = async (req, res) => {
  const { name } = req.body;

  await sequelize.query(
    `INSERT INTO users_role (name) VALUES (:name)`,
    { replacements: { name } }
  );

  res.json({ message: "Role created" });
};

exports.updateRole = async (req, res) => {
  const { id } = req.query;

  await sequelize.query(
    `UPDATE users_role SET name = :name WHERE id = :id`,
    { replacements: { id, ...req.body } }
  );

  res.json({ message: "Updated" });
};

exports.deleteRole = async (req, res) => {
  const { id } = req.query;

  await sequelize.query(
    `DELETE FROM users_role WHERE id = :id`,
    { replacements: { id } }
  );

  res.json({ message: "Deleted" });
};



// ===================== FARMER AADHAR =====================

exports.getFarmer = async (req, res) => {
  const { aadhar_no } = req.query;

  const [data] = await sequelize.query(
    `SELECT * FROM users_farmeraathardetails WHERE aadhar_no = :aadhar_no`,
    { replacements: { aadhar_no } }
  );

  if (!data.length) return res.status(404).json({ error: "Not found" });

  res.json(data[0]);
};

exports.createFarmer = async (req, res) => {
  const f = req.body;

  await sequelize.query(
    `INSERT INTO users_farmeraathardetails
     (farmer_id, name, mobile_number, village, aadhar_no, land_panel_details, created_at, updated_at)
     VALUES (:farmer_id, :name, :mobile_number, :village, :aadhar_no, :land_panel_details, NOW(), NOW())`,
    { replacements: f }
  );

  res.json({ message: "Created" });
};

exports.updateFarmer = async (req, res) => {
  const { id } = req.query;

  await sequelize.query(
    `UPDATE users_farmeraathardetails
     SET name=:name, mobile_number=:mobile_number, village=:village, updated_at=NOW()
     WHERE id=:id`,
    { replacements: { id, ...req.body } }
  );

  res.json({ message: "Updated" });
};

exports.deleteFarmer = async (req, res) => {
  const { id } = req.query;

  await sequelize.query(
    `DELETE FROM users_farmeraathardetails WHERE id=:id`,
    { replacements: { id } }
  );

  res.json({ message: "Deleted" });
};



// ===================== FARMER REQUEST =====================

// CREATE REQUEST
exports.createRequest = async (req, res) => {
  try {
    const { requested_species, ...data } = req.body;

    const [result] = await sequelize.query(
      `INSERT INTO users_farmerrequest
       (farmer_id, name, mobile_number, village, status, created_at)
       VALUES (:farmer_id, :name, :mobile_number, :village, 'pending', NOW())
       RETURNING id`,
      { replacements: data }
    );

    const requestId = result[0].id;

    // Generate ORDER ID like Django signal
    const orderId = `ORD${String(requestId).padStart(4, "0")}`;

    await sequelize.query(
      `UPDATE users_farmerrequest SET orderid = :orderId WHERE id = :id`,
      { replacements: { orderId, id: requestId } }
    );

    for (let item of requested_species) {
      await sequelize.query(
        `INSERT INTO users_farmerrequestitem
         (request_id, stock_id, requested_quantity, status, created_at)
         VALUES (:requestId, :stockId, :qty, 'pending', NOW())`,
        {
          replacements: {
            requestId,
            stockId: item.species_id,
            qty: item.saplings_requested
          }
        }
      );
    }

    res.json({ message: "Request created", request_id: requestId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// APPROVE / REJECT
exports.updateRequestItem = async (req, res) => {
  const { action, item_id, approved_quantity } = req.body;

  if (action === "approve") {
    await sequelize.query(
      `UPDATE users_farmerrequestitem
       SET approved_quantity=:approved_quantity, status='approved'
       WHERE id=:item_id`,
      { replacements: { item_id, approved_quantity } }
    );
  }

  if (action === "reject") {
    await sequelize.query(
      `UPDATE users_farmerrequestitem
       SET status='rejected', approved_quantity=0
       WHERE id=:item_id`,
      { replacements: { item_id } }
    );
  }

  res.json({ message: "Updated" });
};