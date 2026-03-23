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

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Query with JOINs to get Role Name, Production Center ID, and Status
    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.password,
        u.role_id,
        r.name as role_name,
        pc.id as production_center_id,
        pc.status as production_center_status
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
    
    // 5. Send Response
    res.json({
      access: accessToken,
      refresh: refreshToken,
      user_id: user.id,
      role: user.role_name,             
      user_name: user.username,
      production_center_id: user.production_center_id || null,
      production_center_status: user.production_center_status || null // Added Status
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
      district_id,  // Updated: matches payload and DB
      block_id,     // Updated: matches payload and DB
      village_id,   // Updated: matches payload and DB
      aadhar_no, 
      land_panel_details, 
      species_preferred, 
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

    // 5. Insert Query
    // Updated column names to match your DB schema (district_id, block_id, village_id)
    const insertQuery = `
      INSERT INTO users_farmeraathardetails 
      (farmer_id, name, mobile_number, aadhar_no, district_id, block_id, village_id, land_panel_details, species_preferred, purpose, type, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    await db.query(insertQuery, [
      farmer_id,
      name,
      mobile_number,
      aadhar_no,
      district_id,              // Matches district_id column
      block_id,                 // Matches block_id column
      village_id,               // Matches village_id column
      land_panel_details,
      JSON.stringify(species_preferred), 
      purpose,
      type
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
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Destructure from frontend payload
        const { farmer_id, production_center_id, items } = req.body;
        const userId = req.user?.id || 1; // ID of logged-in user (officer/farmer)

        // Validation
        if (!farmer_id || !production_center_id || !items || items.length === 0) {
            return res.status(400).json({ 
                error: "Farmer ID, Production Center, and Items are required" 
            });
        }

        // 2. Insert into users_farmerrequest (Header Table)
        const [result] = await connection.query(
            `INSERT INTO users_farmerrequest 
             (farmer_id, status, created_at, created_by_id, production_center_id) 
             VALUES (?, 'pending', NOW(), ?, ?)`,
            [farmer_id, userId, production_center_id] // <- fixed
        );

        const requestId = result.insertId;

        // 3. Generate Order ID (Format: A-YYYYMMDD-XXXX)
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // e.g., 20260321
        const paddedId = String(requestId).padStart(4, "0"); // e.g., 0001
        const orderId = `A-${dateStr}-${paddedId}`; // Final: A-20260321-0001

        await connection.query(
            `UPDATE users_farmerrequest SET orderid = ? WHERE id = ?`,
            [orderId, requestId]
        );

        // 4. Insert Items into users_farmerrequestitem
        const itemValues = items.map(item => [
            requestId,              // request_id
            item.stock_id,          // stock_id
            item.species_id || null,// species_id (optional)
            item.quantity,          // requested_quantity
            'pending',              // status
            new Date()              // created_at
        ]);

        await connection.query(
            `INSERT INTO users_farmerrequestitem 
             (request_id, stock_id, species_id, requested_quantity, status, created_at) 
             VALUES ?`,
            [itemValues]
        );

        await connection.commit();

        res.status(201).json({ 
            message: "Order placed successfully", 
            order_id: orderId, 
            request_id: requestId 
        });

    } catch (err) {
        await connection.rollback();
        console.error("Order Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};
exports.approveItem = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { action, approved_quantity } = req.body;

    console.log("Incoming Request:", { id, action, approved_quantity });

    if (action === "approve") {
      if (approved_quantity === undefined || approved_quantity === null) {
        return res.status(400).json({ error: "Approved quantity is required" });
      }

      // 1. Update request item
      const [updateResult] = await connection.query(
        `UPDATE users_farmerrequestitem 
         SET approved_quantity = ?, status = 'approved' 
         WHERE id = ?`,
        [approved_quantity, id]
      );

      console.log("Request Item Updated:", updateResult);

      // 2. Get stock_id
      const [itemRows] = await connection.query(
        `SELECT stock_id FROM users_farmerrequestitem WHERE id = ?`,
        [id]
      );

      console.log("Fetched Item Rows:", itemRows);

      if (itemRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Item not found" });
      }

      const stockId = itemRows[0].stock_id;
      console.log("Stock ID:", stockId);

      // OPTIONAL: Check current allocated_quantity BEFORE update
      const [beforeStock] = await connection.query(
        `SELECT allocated_quantity FROM productioncenter_stockdetails WHERE id = ?`,
        [stockId]
      );

      console.log("Before Update Stock:", beforeStock);

      // 3. Update stock
      const [stockUpdateResult] = await connection.query(
        `UPDATE productioncenter_stockdetails 
         SET allocated_quantity = allocated_quantity + ? 
         WHERE id = ?`,
        [approved_quantity, stockId]
      );

      console.log("Stock Update Result:", stockUpdateResult);

      // OPTIONAL: Check AFTER update
      const [afterStock] = await connection.query(
        `SELECT allocated_quantity FROM productioncenter_stockdetails WHERE id = ?`,
        [stockId]
      );

      console.log("After Update Stock:", afterStock);

    } else if (action === "reject") {
      const [rejectResult] = await connection.query(
        `UPDATE users_farmerrequestitem 
         SET status = 'rejected', approved_quantity = 0 
         WHERE id = ?`,
        [id]
      );

      console.log("Reject Result:", rejectResult);
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    await connection.commit();
    console.log("Transaction committed successfully");

    // ✅ CLEAR CACHE HERE
try {
  const keys = await redisClient.keys("stock_details_*");
  if (keys.length > 0) {
    await redisClient.del(keys);
    console.log("🧹 Stock cache cleared:", keys);
  } else {
    console.log("ℹ️ No cache keys found");
  }
} catch (cacheErr) {
  console.error("Cache clearing error:", cacheErr);
}


    res.json({ message: "Updated successfully" });

  } catch (err) {
    await connection.rollback();
    console.error("Approve Item Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};

exports.getCenterOrders = async (req, res) => {
    try {
        const { production_center_id, user_id } = req.query;

        console.log("👉 Incoming Query Params:", req.query);

        // ✅ At least one filter required
        if (!production_center_id && !user_id) {
            return res.status(400).json({
                error: "Either production_center_id or user_id is required"
            });
        }

        // ✅ Dynamic WHERE clause
        let whereConditions = [];
        let params = [];

        if (production_center_id) {
            whereConditions.push(`fr.production_center_id = ?`);
            params.push(production_center_id);
        }

        if (user_id) {
            whereConditions.push(`fr.created_by_id = ?`);
            params.push(user_id);
        }

        const whereClause = whereConditions.length
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";

        console.log("👉 WHERE Clause:", whereClause);
        console.log("👉 Params:", params);

        // 1. Fetch raw flat data
        const query = `
            SELECT 
                fr.id as request_id,
                fr.orderid,
                fr.status as order_status,
                fr.created_at as order_date,
                f.name as farmer_name,
                f.mobile_number as farmer_mobile,
                f.farmer_id as farmer_code,
                fri.id as item_id,
                fri.stock_id,
                fri.species_id,
                fri.requested_quantity,
                fri.approved_quantity,
                fri.status as item_status,
                t.name as species_name,
                t.name_tamil as species_name_tamil
            FROM users_farmerrequest fr
            JOIN users_farmerrequestitem fri ON fr.id = fri.request_id
            LEFT JOIN users_farmeraathardetails f ON fr.farmer_id = f.farmer_id
            LEFT JOIN tbl_agroforest_trees t ON fri.species_id = t.id
            ${whereClause}
            ORDER BY fr.created_at DESC
        `;

        console.log("👉 Final Query:", query);

        const [rows] = await db.query(query, params);

        console.log("👉 Raw DB Rows Count:", rows.length);

        // 2. Group orders
        const ordersMap = {};

        rows.forEach(row => {
            if (!ordersMap[row.request_id]) {
                ordersMap[row.request_id] = {
                    request_id: row.request_id,
                    orderid: row.orderid,
                    order_status: row.order_status,
                    order_date: row.order_date,
                    farmer_name: row.farmer_name,
                    farmer_mobile: row.farmer_mobile,
                    farmer_code: row.farmer_code,
                    requested_items: []
                };
            }

            if (row.item_id) {
                ordersMap[row.request_id].requested_items.push({
                    item_id: row.item_id,
                    stock_id: row.stock_id,
                    species_id: row.species_id,
                    species_name: row.species_name,
                    species_name_tamil: row.species_name_tamil,
                    requested_quantity: row.requested_quantity,
                    approved_quantity: row.approved_quantity,
                    item_status: row.item_status
                });
            }
        });

        const results = Object.values(ordersMap);

        console.log("👉 Final Response Count:", results.length);

        res.json({
            count: results.length,
            results
        });

    } catch (err) {
        console.error("❌ Fetch Orders Error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getTnSchemas = async (req, res) => {
    try {
        // Fetch all entries from tn_schema table
        const [rows] = await db.query(`SELECT id, name FROM tn_schema ORDER BY id ASC`);
        
        res.json({ 
            count: rows.length, 
            results: rows 
        });
    } catch (err) {
        console.error("Error fetching schemas:", err);
        res.status(500).json({ error: err.message });
    }
};


// 1. Update Request Header (Type & Scheme)
exports.updateRequestHeader = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, type, scheme_id } = req.body;

        await db.query(
            `UPDATE users_farmerrequest SET status = ?, type = ?, scheme_id = ? WHERE id = ?`,
            [status, type || 'non-scheme', scheme_id || null, id]
        );
        res.json({ message: "Header updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Order Placed / Billing
exports.orderPlaced = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { request_id, payment_type, total_amount, type, scheme_id } = req.body;

        console.log("Incoming Order:", { request_id, payment_type, total_amount, type, scheme_id });

        // 1. Update request header
        const [headerResult] = await connection.query(
            `UPDATE users_farmerrequest 
             SET status = 'billed', payment_type = ?, total_amount = ?, type = ?, scheme_id = ? 
             WHERE id = ?`,
            [payment_type, total_amount, type, scheme_id, request_id]
        );

        console.log("Header Update Result:", headerResult);

        // 2. Get approved items
        const [items] = await connection.query(
            `SELECT stock_id, approved_quantity 
             FROM users_farmerrequestitem 
             WHERE request_id = ? AND approved_quantity > 0`,
            [request_id]
        );

        console.log("Approved Items:", items);

        // 3. Update stock for each item
        for (const item of items) {
            console.log("Processing Item:", item);

            // BEFORE values
            const [beforeStock] = await connection.query(
                `SELECT saplings_available, allocated_quantity 
                 FROM productioncenter_stockdetails 
                 WHERE id = ?`,
                [item.stock_id]
            );

            console.log(`Before Update (stock_id=${item.stock_id}):`, beforeStock);

            // UPDATE
            const [updateResult] = await connection.query(
                `UPDATE productioncenter_stockdetails
                 SET saplings_available = saplings_available - ?,
                     allocated_quantity = allocated_quantity - ?
                 WHERE id = ?`,
                [item.approved_quantity, item.approved_quantity, item.stock_id]
            );

            console.log(`Update Result (stock_id=${item.stock_id}):`, updateResult);

            // AFTER values
            const [afterStock] = await connection.query(
                `SELECT saplings_available, allocated_quantity 
                 FROM productioncenter_stockdetails 
                 WHERE id = ?`,
                [item.stock_id]
            );

            console.log(`After Update (stock_id=${item.stock_id}):`, afterStock);

            // ⚠️ If no rows updated
            if (updateResult.affectedRows === 0) {
                console.log("⚠️ No stock row updated for stock_id:", item.stock_id);
            }

            // ⚠️ If negative stock happens
            if (afterStock.length > 0 && afterStock[0].saplings_available < 0) {
                console.log("❌ Negative saplings_available detected!", afterStock[0]);
            }
        }

        await connection.commit();
        console.log("Transaction committed successfully");

        try {
    const keys = await redisClient.keys("stock_details_*");
    if (keys.length > 0) {
        await redisClient.del(keys);
        console.log("🧹 Stock cache cleared:", keys);
    } else {
        console.log("ℹ️ No cache keys found");
    }
} catch (cacheErr) {
    console.error("Cache clearing error:", cacheErr);
}

        res.json({ message: "Bill generated successfully and stock updated" });

    } catch (err) {
        await connection.rollback();
        console.error("Order Billing Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};