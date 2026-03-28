const db = require("../../db"); // Make sure this path points to your db config
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");

const sendOtpEmail = require('../../utils/mailer');
const redisClient = require('../../redisClient');
const sendOtpSms = require('../../utils/sendSms');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const cache = new NodeCache({ stdTTL: 180 }); 

// ===================== AUTH =====================

// REGISTER (SEND OTP)
exports.register = async (req, res) => {
  try {
    // 1. Destructure Email along with other fields
    const { username, password, phone, role, email } = req.body;
    
    // 2. Validate required fields
    if (!phone || !password || !email) {
      return res.status(400).json({ message: 'Phone, Password, and Email are required' });
    }

    // 3. Normalize & validate phone
    const pn = parsePhoneNumberFromString(phone, 'IN');
    if (!pn || !pn.isValid()) return res.status(400).json({ message: 'Invalid phone number' });
    const e164 = pn.number; // e.g., +919789754800

    // 4. Check if user exists by Phone
    const [existingPhone] = await db.query('SELECT id FROM users_customuser WHERE phone = ?', [e164]);
    if (existingPhone.length > 0) {
      return res.status(400).json({ message: 'User with this phone already exists.' });
    }

    // 5. Check if user exists by Email (New Check)
    const [existingEmail] = await db.query('SELECT id FROM users_customuser WHERE email = ?', [email]);
    if (existingEmail.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // 6. Generate OTP and hashed password
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);

    // 7. Include Email in the pending object
    const pending = { 
      username, 
      phone: e164, 
      email, // Added Email
      password: hashedPassword, 
      role_id: role, 
      otp 
    };

    // 8. Store in Redis with 10 min TTL
    await redisClient.set(`register_${e164}`, JSON.stringify(pending), { EX: 600 });

    // 9. Send SMS (uncomment when ready)
    // await sendOtpSms(e164, otp);

    return res.status(200).json({ message: 'OTP sent to phone', "otp": otp });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// VERIFY OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP required' });

    // 1. Normalize Phone
    const pn = parsePhoneNumberFromString(phone, 'IN');
    if (!pn || !pn.isValid()) return res.status(400).json({ message: 'Invalid phone number' });
    const e164 = pn.number; 

    // 2. Get Cached Data from Redis
    const cachedDataString = await redisClient.get(`register_${e164}`);
    if (!cachedDataString) {
      return res.status(400).json({ message: 'OTP expired or invalid request. Please register again.' });
    }

    const cachedData = JSON.parse(cachedDataString);

    // 3. Verify OTP
    if (cachedData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // 4. Insert into Database
    // COLUMNS: username, phone, email, password, role_id, is_active, is_superuser, first_name, date_joined
    // COUNT: 9 Columns
    
    const insertQuery = `
      INSERT INTO users_customuser
        (username, phone, email, password, role_id, is_active, is_superuser, first_name, date_joined)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    // Note above: I added an extra '?' before CURRENT_TIMESTAMP to match the 'first_name' column.

    await db.query(insertQuery, [
      cachedData.username,   // 1. ?
      cachedData.phone,      // 2. ?
      cachedData.email,      // 3. ?
      cachedData.password,   // 4. ?
      cachedData.role_id,    // 5. ?
      true,                  // 6. ?
      false,                 // 7. ?
      null                   // 8. ? (This is for first_name)
                             // 9. CURRENT_TIMESTAMP is handled by SQL
    ]);
    
    // 5. Cleanup Redis
    await redisClient.del(`register_${e164}`);
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
    // This query runs directly against the DB every time. No cache here.
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

    // 3. Generate Access Token
    // ⚠️ IMPORTANT: This token holds the role. If you change the role in DB,
    // this token must be regenerated (User must Logout & Login).
    const accessToken = jwt.sign(
      { id: user.id, role: user.role_name },
      JWT_SECRET,
      { expiresIn: '2h' }
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
      production_center_status: user.production_center_status || null
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


exports.forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });
    console.log(phone,"phone")
    const pn = parsePhoneNumberFromString(phone, 'IN');
    console.log('Input Phone:', phone, 'Parsed Result:', pn);
    if (!pn || !pn.isValid()) return res.status(400).json({ message: 'Invalid phone number' });
    const e164 = pn.number;

    // Check if user exists
    const [users] = await db.query('SELECT id FROM users_customuser WHERE phone = ?', [e164]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found with this phone number' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in Redis with 10 min TTL (Key: reset_<phone>)
    await redisClient.set(`reset_${e164}`, otp, { EX: 600 });

    // Send SMS
    // await sendOtpSms(e164, otp);

    return res.status(200).json({ message: 'OTP sent to phone', otp }); // 'otp' returned for testing, remove in prod
  } catch (err) {
    console.error('Forgot Password Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// 2. RESET PASSWORD (Verify OTP & Set New Password)
exports.resetPassword = async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;
    
    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ message: 'Phone, OTP, and New Password are required' });
    }

    // FIX 1: Add 'IN' as the second argument to handle local numbers like 978...
    const pn = parsePhoneNumberFromString(phone, 'IN');
    
    if (!pn || !pn.isValid()) return res.status(400).json({ message: 'Invalid phone number' });
    
    const e164 = pn.number; // e.g., +919789754800
    const national = pn.nationalNumber; // e.g., 9789754800

    // FIX 2: Find the user in DB to get their EXACT stored phone number.
    // This ensures we check Redis with the correct key (matches forgotPassword logic).
    const [users] = await db.query(
      'SELECT phone FROM users_customuser WHERE phone = ? OR phone = ?', 
      [e164, national]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const storedPhone = users[0].phone; // This is the key used in Redis

    // Check Redis for OTP using the exact phone string from DB
    const storedOtp = await redisClient.get(`reset_${storedPhone}`);
    
    if (!storedOtp) {
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update User in DB
    await db.query('UPDATE users_customuser SET password = ? WHERE phone = ?', [hashedPassword, storedPhone]);

    // Delete OTP from Redis to prevent reuse
    await redisClient.del(`reset_${storedPhone}`);

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    return res.status(500).json({ error: err.message });
  }
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

exports.updateFarmer = async (req, res) => {
  try {
    // 1. Get Farmer ID from URL params (e.g., FAR001 or NFAR001)
    const { id } = req.params;

    // 2. Destructure fields from body
    // We focus on species_preferred, but allow updating other fields if provided
    const { 
      species_preferred, 
      name, 
      mobile_number, 
      village_id, 
      block_id, 
      district_id, 
      purpose, 
      land_panel_details 
    } = req.body;

    // 3. Validation: Ensure there is something to update
    if (!species_preferred && !name && !mobile_number && !village_id) {
      return res.status(400).json({ error: "No fields provided for update." });
    }

    // 4. Build Dynamic SQL Query
    // This allows updating specific fields without overwriting others
    let updateFields = [];
    let queryParams = [];

    if (name) {
      updateFields.push("name = ?");
      queryParams.push(name);
    }
    if (mobile_number) {
      updateFields.push("mobile_number = ?");
      queryParams.push(mobile_number);
    }
    if (district_id) {
      updateFields.push("district_id = ?");
      queryParams.push(district_id);
    }
    if (block_id) {
      updateFields.push("block_id = ?");
      queryParams.push(block_id);
    }
    if (village_id) {
      updateFields.push("village_id = ?");
      queryParams.push(village_id);
    }
    if (purpose) {
      updateFields.push("purpose = ?");
      queryParams.push(purpose);
    }
    if (land_panel_details) {
      updateFields.push("land_panel_details = ?");
      queryParams.push(land_panel_details);
    }

    // Handle Species Preferred (JSON stringification)
    if (species_preferred) {
      updateFields.push("species_preferred = ?");
      // Convert array to JSON string for MySQL
      queryParams.push(JSON.stringify(species_preferred));
    }

    // Always update the updated_at timestamp
    updateFields.push("updated_at = NOW()");

    // Add the ID to the end of params for the WHERE clause
    queryParams.push(id);

    const updateQuery = `
      UPDATE users_farmeraathardetails 
      SET ${updateFields.join(', ')} 
      WHERE farmer_id = ?
    `;

    // 5. Execute Query
    const [result] = await db.query(updateQuery, queryParams);

    // 6. Check if row exists
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Farmer not found with ID: " + id });
    }

    res.status(200).json({ 
      message: "Farmer details updated successfully", 
      farmer_id: id 
    });

  } catch (err) {
    console.error("Update Error:", err);
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
        const { production_center_id, user_id,status, limit, offset } = req.query;

        console.log("👉 Incoming Query Params:", req.query);

        // if (!production_center_id && !user_id) {
        //     return res.status(400).json({
        //         error: "Either production_center_id or user_id is required"
        //     });
        // }

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
        if (status) {
      // support comma-separated list or single status
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        whereConditions.push(`fr.status = ?`);
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        const placeholders = statuses.map(() => '?').join(',');
        whereConditions.push(`fr.status IN (${placeholders})`);
        params.push(...statuses);
      }
    }
        const whereClause = whereConditions.length
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";

        let limitValue = limit ? parseInt(limit) : undefined;
        let offsetValue = offset ? parseInt(offset) : undefined;
        
        if (isNaN(limitValue)) limitValue = undefined;
        if (isNaN(offsetValue)) offsetValue = undefined;

        const limitClause = limitValue ? `LIMIT ?` : "";
        const offsetClause = offsetValue ? `OFFSET ?` : "";

        // Use DESC for Newest first, or ASC for Oldest first
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
            ${limitClause} ${offsetClause}
        `;

        const queryParams = [...params, limitValue, offsetValue].filter(v => v !== undefined);
        const [rows] = await db.query(query, queryParams);

        // ✅ FIXED: Using Map to preserve the SQL Sort Order
        const ordersMap = new Map();

        rows.forEach(row => {
            if (!ordersMap.has(row.request_id)) {
                ordersMap.set(row.request_id, {
                    request_id: row.request_id,
                    orderid: row.orderid,
                    order_status: row.order_status,
                    order_date: row.order_date,
                    farmer_name: row.farmer_name,
                    farmer_mobile: row.farmer_mobile,
                    farmer_code: row.farmer_code,
                    requested_items: []
                });
            }

            if (row.item_id) {
                ordersMap.get(row.request_id).requested_items.push({
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

        // Convert Map back to array (stays in order)
        const results = Array.from(ordersMap.values());

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

        // Added scheme_total_amount to destructuring
        const { request_id, payment_type, total_amount, type, scheme_id, scheme_total_amount } = req.body;

        console.log("Incoming Order:", { request_id, payment_type, total_amount, type, scheme_id, scheme_total_amount });

        // 1. Update request header
        // Added scheme_total_amount to the UPDATE query
        const [headerResult] = await connection.query(
            `UPDATE users_farmerrequest 
             SET status = 'billed', payment_type = ?, total_amount = ?, type = ?, scheme_id = ?, scheme_total_amount = ? 
             WHERE id = ?`,
            [payment_type, total_amount, type, scheme_id, scheme_total_amount, request_id]
        );

        console.log("Header Update Result:", headerResult);

        // 2. Get approved items WITH their price
        const [items] = await connection.query(
            `SELECT 
                fri.stock_id, 
                fri.approved_quantity,
                ps.price_per_sapling 
             FROM users_farmerrequestitem fri
             JOIN productioncenter_stockdetails ps ON fri.stock_id = ps.id
             WHERE fri.request_id = ? AND fri.approved_quantity > 0`,
            [request_id]
        );

        console.log("Approved Items with Price:", items);

        // 3. Update stock for each item
        for (const item of items) {
            console.log("Processing Item:", item);

            const itemTotalPrice = item.approved_quantity * (item.price_per_sapling || 0);

            const [beforeStock] = await connection.query(
                `SELECT saplings_available, allocated_quantity, total_selled, total_selled_price
                 FROM productioncenter_stockdetails 
                 WHERE id = ?`,
                [item.stock_id]
            );

            console.log(`Before Update (stock_id=${item.stock_id}):`, beforeStock);

            const [updateResult] = await connection.query(
                `UPDATE productioncenter_stockdetails
                 SET 
                    saplings_available = saplings_available - ?,
                    allocated_quantity = allocated_quantity - ?,
                    total_selled = total_selled + ?,
                    total_selled_price = total_selled_price + ?
                 WHERE id = ?`,
                [
                    item.approved_quantity,
                    item.approved_quantity,
                    item.approved_quantity,
                    itemTotalPrice,
                    item.stock_id
                ]
            );

            console.log(`Update Result (stock_id=${item.stock_id}):`, updateResult);

            const [afterStock] = await connection.query(
                `SELECT saplings_available, allocated_quantity, total_selled, total_selled_price
                 FROM productioncenter_stockdetails 
                 WHERE id = ?`,
                [item.stock_id]
            );

            console.log(`After Update (stock_id=${item.stock_id}):`, afterStock);

            if (updateResult.affectedRows === 0) {
                console.log("⚠️ No stock row updated for stock_id:", item.stock_id);
            }

            if (afterStock.length > 0 && afterStock[0].saplings_available < 0) {
                console.log("❌ Negative saplings_available detected!", afterStock[0]);
            }
        }

        await connection.commit();
        console.log("Transaction committed successfully");

        // Clear Cache
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

// DASHBOARD API GET CALL 


exports.getTopProductionCenters = async (req, res) => {
    try {
        const query = `
            SELECT 
                pc.id as production_center_id,
                pc.name_of_production_centre,
                pc.contact_person,
                pc.mobile_number,
                d.District_Name,
                COUNT(fr.id) as total_requests
            FROM users_farmerrequest fr
            JOIN productioncenter_productioncenter pc ON fr.production_center_id = pc.id
            LEFT JOIN master_district d ON pc.district_id = d.id
            GROUP BY fr.production_center_id
            ORDER BY total_requests DESC
            LIMIT 10;
        `;

        const [results] = await db.query(query);
        res.json(results);

    } catch (err) {
        console.error("Top Production Centers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 2. Saplings Available District Wise
exports.getSaplingsDistrictWise = async (req, res) => {
    try {
        const query = `
            SELECT 
                d.id as district_id,
                d.District_Name,
                COUNT(DISTINCT pc.id) as total_production_centers,
                SUM(sd.saplings_available) as total_saplings_available,
                SUM(sd.allocated_quantity) as total_allocated_quantity
            FROM productioncenter_stockdetails sd
            JOIN productioncenter_productioncenter pc ON sd.production_center_id = pc.id
            RIGHT JOIN master_district d ON pc.district_id = d.id
            GROUP BY d.id
            ORDER BY d.District_Name ASC;
        `;

        const [results] = await db.query(query);
        res.json(results);

    } catch (err) {
        console.error("District Wise Saplings Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ===================== MAP DATA =====================

// Get all active production centers with location and stock
exports.getProductionCentersForMap = async (req, res) => {
    try {
        const query = `
            SELECT 
                pc.id,
                pc.name_of_production_centre,
                pc.contact_person,
                pc.mobile_number,
                pc.complete_address,
                pc.latitude,
                pc.longitude,
                pc.production_type,
                pc.status,
                
                -- Location Names
                d.District_Name,
                b.Block_Name,
                v.Village_Name,

                -- Aggregated Stock Data
                COUNT(sd.id) as total_stock_entries,
                COALESCE(SUM(sd.saplings_available), 0) as total_saplings_available,
                COALESCE(SUM(sd.allocated_quantity), 0) as total_allocated_quantity

            FROM productioncenter_productioncenter pc
            
            -- Join Location Tables
            LEFT JOIN master_district d ON pc.district_id = d.id
            LEFT JOIN master_block b ON pc.block_id = b.id
            LEFT JOIN master_village v ON pc.village_id = v.id
            
            -- Join Stock Table (to calculate totals)
            LEFT JOIN productioncenter_stockdetails sd ON sd.production_center_id = pc.id

            WHERE pc.latitude IS NOT NULL AND pc.longitude IS NOT NULL
            GROUP BY pc.id
            ORDER BY pc.name_of_production_centre ASC
        `;

        const [results] = await db.query(query);

        // Optional: Convert null lat/lng to 0 if needed by your frontend map library
        const formattedResults = results.map(center => ({
            ...center,
            latitude: parseFloat(center.latitude) || 0,
            longitude: parseFloat(center.longitude) || 0,
            total_saplings_available: parseInt(center.total_saplings_available) || 0,
            total_allocated_quantity: parseInt(center.total_allocated_quantity) || 0
        }));

        res.json(formattedResults);

    } catch (err) {
        console.error("Get Map Data Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getFarmerRequestItemByStockId = async (req, res) => {
  try {
    const { stock_id } = req.query;
    if (!stock_id) {
      return res.status(400).json({
        message: "stock_id is required in query parameters",
      });
    }

    const [items] = await db.query(
      `
        SELECT 
          fri.*,
          fr.farmer_id,
          aft.name AS species_name
        FROM users_farmerrequestitem fri
        INNER JOIN users_farmerrequest fr ON fri.request_id = fr.id
        INNER JOIN tbl_agroforest_trees aft ON fri.species_id = aft.id
        WHERE fri.stock_id = ? AND fri.status = 'approved' AND fr.status= 'order-placed'
      `,
      [stock_id]
    );

    if (!items.length) {
      return res.status(404).json({
        message: "No approved request items found for this stock_id",
      });
    }

    res.json(items);
  } catch (err) {
    console.error("Get Farmer Request Item Error:", err);
    res.status(500).json({
      error: err.message,
    });
  }
};


exports.getDashboardCounts = async (req, res) => {
    try {
        // 1. Get data from Token (Logged in user)
        const user = req.user || {}; 
        
        // 2. Get data from URL Query Params (For Postman Testing)
        // We prioritize Query Params > Token Data
        const role = req.query.role || user.role;
        const department_id = req.query.department_id || user.department_id;
        const district_id = req.query.district_id || user.district_id;
        const block_id = req.query.block_id || user.block_id;

        // ---------------------------------------------------------
        // STRICT ROLE CHECK
        // ---------------------------------------------------------
        if (role) {
            
            // --- Sub-validations for specific roles ---
            if (role === 'department_admin' && !department_id) {
                return res.status(400).json({ success: false, error: "Department ID is required for Department Admin." });
            }
            if (role === 'district_admin' && !district_id) {
                return res.status(400).json({ success: false, error: "District ID is required for District Admin." });
            }
            if (role === 'block_admin' && !block_id) {
                return res.status(400).json({ success: false, error: "Block ID is required for Block Admin." });
            }

            // ---------------------------------------------------------
            // PREPARE DYNAMIC FILTERS
            // ---------------------------------------------------------
            let filterColumn = null;
            let filterValue = null;

            if (role === 'department_admin') {
                filterColumn = 'department_id';
                filterValue = department_id;
            } else if (role === 'district_admin') {
                filterColumn = 'district_id';
                filterValue = district_id;
            } else if (role === 'block_admin') {
                filterColumn = 'block_id';
                filterValue = block_id;
            }
            // If role is superadmin, filterColumn remains null (No filter applied)

            // Helper for simple table counts
            const getSimpleCount = async (tableName) => {
                let query = `SELECT COUNT(*) as count FROM ${tableName}`;
                let queryParams = [];
                
                if (filterColumn) {
                    query += ` WHERE ${filterColumn} = ?`;
                    queryParams.push(filterValue);
                }
                
                const [rows] = await db.query(query, queryParams);
                return rows[0]?.count || 0;
            };

            // Helper for User Role counts
            const getUserRoleCount = async (targetRoleName) => {
                let query = `
                    SELECT COUNT(u.id) as count 
                    FROM users_customuser u
                    JOIN users_role r ON u.role_id = r.id
                    WHERE r.name = ?
                `;
                let queryParams = [targetRoleName];

                if (filterColumn) {
                    query += ` AND u.${filterColumn} = ?`;
                    queryParams.push(filterValue);
                }

                const [rows] = await db.query(query, queryParams);
                return rows[0]?.count || 0;
            };

            // ---------------------------------------------------------
            // FETCH DATA
            // ---------------------------------------------------------
            let data = {};

            // A. DEPARTMENT ADMIN COUNT (Only Superadmin)
            if (role === 'superadmin') {
                data.department_admin_count = await getUserRoleCount('department_admin');
            }

            // B. DISTRICT ADMIN COUNT (Superadmin & Dept Admin)
            if (['superadmin', 'department_admin'].includes(role)) {
                data.district_admin_count = await getUserRoleCount('district_admin');
            }

            // C. BLOCK ADMIN COUNT (Superadmin, Dept Admin, Dist Admin)
            if (['superadmin', 'department_admin', 'district_admin'].includes(role)) {
                data.block_admin_count = await getUserRoleCount('block_admin');
            }

            // D. PRODUCTION CENTER COUNT (Visible to all)
            if (['superadmin', 'department_admin', 'district_admin', 'block_admin'].includes(role)) {
                data.production_centers_count = await getSimpleCount('productioncenter_productioncenter');
            }

            // E. FARMER COUNT (Visible to all)
            if (['superadmin', 'department_admin', 'district_admin', 'block_admin'].includes(role)) {
                data.farmers_count = await getSimpleCount('users_farmeraathardetails');
            }

            // F. SPECIES IN STOCK COUNT (Visible to all)
            if (['superadmin', 'department_admin', 'district_admin', 'block_admin'].includes(role)) {
                let query = `
                    SELECT COUNT(DISTINCT ps.species_id) as count 
                    FROM productioncenter_stockdetails ps
                    JOIN productioncenter_productioncenter pc ON ps.production_center_id = pc.id
                `;
                let queryParams = [];

                if (filterColumn) {
                    query += ` WHERE pc.${filterColumn} = ?`;
                    queryParams.push(filterValue);
                }

                const [specRows] = await db.query(query, queryParams);
                data.species_in_stock_count = specRows[0]?.count || 0;
            }

            // ---------------------------------------------------------
            // SEND SUCCESS RESPONSE
            // ---------------------------------------------------------
            res.status(200).json({
                success: true,
                data: data
            });

        } else {
            // ---------------------------------------------------------
            // ERROR BLOCK (No Role Found)
            // ---------------------------------------------------------
            return res.status(400).json({
                success: false,
                error: "User role is required."
            });
        }

    } catch (err) {
        console.error("❌ Dashboard Count Error:", err);
        res.status(500).json({ 
            success: false, 
            error: "Failed to fetch dashboard counts",
            details: err.message 
        });
    }
};

exports.getWeeklyFarmerRequestReport = async (req, res) => {
    try {
        // 1. Get Date, Role, and Scope Params
        const { start_date, end_date, role, department_id, district_id, block_id } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                error: "start_date and end_date are required"
            });
        }

        // Convert DD/MM/YYYY to YYYY-MM-DD for MySQL
        const formatDate = (dateStr) => {
            const [day, month, year] = dateStr.split('/');
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        };

        const startDate = formatDate(start_date);
        const endDate = formatDate(end_date);

        // 2. Build Query with Joins and Filters
        const queryParams = [startDate, `${endDate} 23:59:59`];
        
        // Base Query - Join with productioncenter table to check scope
        let query = `
            SELECT 
                DATE(fr.created_at) as report_date,
                COUNT(*) as orders_count,
                COUNT(DISTINCT fr.production_center_id) as production_centers_count,
                SUM(CASE WHEN fr.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN fr.status = 'order-placed' THEN 1 ELSE 0 END) as order_placed_count,
                SUM(CASE WHEN fr.status = 'billed' THEN 1 ELSE 0 END) as billed_count
            FROM users_farmerrequest fr
            LEFT JOIN productioncenter_productioncenter pc ON fr.production_center_id = pc.id
            WHERE fr.created_at BETWEEN ? AND ?
        `;

        // Role-based Scope Filtering
        if (role === 'department_admin' && department_id) {
            query += ` AND pc.department_id = ?`;
            queryParams.push(department_id);
        } else if (role === 'district_admin' && district_id) {
            query += ` AND pc.district_id = ?`;
            queryParams.push(district_id);
        } else if (role === 'block_admin' && block_id) {
            query += ` AND pc.block_id = ?`;
            queryParams.push(block_id);
        }
        // If role is superadmin or no scope params provided, no extra filter is added (shows all)

        // Grouping and Ordering
        query += ` GROUP BY DATE(fr.created_at) ORDER BY report_date`;

        // 3. Execute Query
        const [rows] = await db.query(query, queryParams);

        // 4. Format Response
        const reportData = rows.map(row => ({
            date: row.report_date,
            orders_count: row.orders_count || 0,
            production_centers_count: row.production_centers_count || 0,
            pending: row.pending_count || 0,
            'order-placed': row.order_placed_count || 0,
            billed: row.billed_count || 0
        }));

        res.status(200).json({
            success: true,
            start_date: start_date,
            end_date: end_date,
            data: reportData
        });

    } catch (err) {
        console.error("❌ Weekly Report Error:", err);
        res.status(500).json({ 
            success: false, 
            error: "Failed to fetch weekly report",
            details: err.message 
        });
    }
};

exports.getProductionCentersList = async (req, res) => {
    try {
        console.log("🚀 --- PRODUCTION CENTERS LIST API ---");
        
        // 1. Get user info for filtering
        const { role, district_id, block_id } = req.user;
        console.log("🔐 User Role:", role);

        // 2. Construct Query
        // We select center details and SUM the saplings_available from the stock table.
        // LEFT JOIN ensures we show centers even if they have 0 stock.
        let query = `
  SELECT 
    pc.id,
    pc.name_of_production_centre,
    pc.complete_address,
    pc.status,
    pc.district_id,
    md.District_Name AS District_Name,
    pc.production_type,
    COALESCE(SUM(ps.saplings_available), 0) as total_stock_count
  FROM productioncenter_productioncenter pc
  LEFT JOIN productioncenter_stockdetails ps ON pc.id = ps.production_center_id
  LEFT JOIN master_district md ON pc.district_id = md.id
`;

        const params = [];

        // 3. Apply Role-Based Filters
        // These columns exist in the 'productioncenter_productioncenter' table
        if (role === 'district_admin' && district_id) {
            query += ` WHERE pc.district_id = ?`;
            params.push(district_id);
        } else if (role === 'block_admin' && block_id) {
            query += ` WHERE pc.block_id = ?`;
            params.push(block_id);
        }
        // Note: Superadmin or Department Admin gets no filter (sees all)

        // 4. Group By is required for the SUM() function to work per center
        query += ` GROUP BY pc.id`;

        console.log("📝 SQL:", query);
        console.log("📦 Params:", params);

        // 5. Execute
        const [rows] = await db.query(query, params);

        console.log(`✅ Found ${rows.length} production centers.`);

        res.status(200).json({
            success: true,
            data: rows
        });

    } catch (err) {
        console.error("❌ Production Centers List Error:", err);
        res.status(500).json({ 
            success: false, 
            error: "Failed to fetch production centers",
            details: err.message 
        });
    }
};

exports.getTargetDetails = async (req, res) => {
    try {
        // 1. Get Data from Token & Query Params
        const user = req.user || {};
        
        const role = req.query.role || user.role;
        const target_level = req.query.target_level; // department, district, block, productioncenter
        
        const department_id = req.query.department_id || user.department_id;
        const district_id = req.query.district_id || user.district_id;
        const block_id = req.query.block_id || user.block_id;

        // ---------------------------------------------------------
        // 1. VALIDATION
        // ---------------------------------------------------------
        if (!target_level) {
            return res.status(400).json({ success: false, error: "Query param 'target_level' is required." });
        }

        // Strict Role Checks (Ensure ID exists for the role)
        if (role === 'department_admin' && !department_id) {
            return res.status(400).json({ success: false, error: "Department ID is required for Department Admin." });
        }
        if (role === 'district_admin' && !district_id) {
            return res.status(400).json({ success: false, error: "District ID is required for District Admin." });
        }
        if (role === 'block_admin' && !block_id) {
            return res.status(400).json({ success: false, error: "Block ID is required for Block Admin." });
        }

        // ---------------------------------------------------------
        // 2. PREPARE QUERY VARIABLES
        // ---------------------------------------------------------
        let query = "";
        let queryParams = [];
        let whereClauses = []; // Collects WHERE conditions

        // ---------------------------------------------------------
        // 3. DYNAMIC QUERY BUILDER
        // ---------------------------------------------------------

        // A. TARGET LEVEL: DEPARTMENT
        if (target_level === 'department') {
            query = `
                SELECT 
                    td.id,
                    td.target_tag,
                    td.target_quantity,
                    td.start_date,
                    td.end_date,
                    td.created_at,
                    d.name AS department_name,
                    u.username AS created_by_name
                FROM target_department td
                LEFT JOIN department d ON td.department_id = d.id
                LEFT JOIN users_customuser u ON td.created_by = u.id
            `;

            // Filter Logic for Department Table
            if (role === 'department_admin') {
                whereClauses.push("td.department_id = ?");
                queryParams.push(department_id);
            }
            // Superadmin sees all (No filter)

        } 
        
        // B. TARGET LEVEL: DISTRICT
        else if (target_level === 'district') {
            query = `
                SELECT 
                    tdis.id,
                    tdis.target_quantity,
                    tdis.start_date,
                    tdis.end_date,
                    tdis.status,
                    tdis.created_at,
                    dis.District_Name AS district_name,
                    u.username AS created_by_name
                FROM target_district tdis
                LEFT JOIN master_district dis ON tdis.district_id = dis.id
                LEFT JOIN users_customuser u ON tdis.created_by = u.id
            `;

            // Filter Logic for District Table
            if (role === 'department_admin') {
                // As requested: Filter by department_id column in this table
                whereClauses.push("tdis.target_department_id = ?");
                queryParams.push(department_id);
            } else if (role === 'district_admin') {
                whereClauses.push("tdis.district_id = ?");
                queryParams.push(district_id);
            }

        } 
        
        // C. TARGET LEVEL: BLOCK
        else if (target_level === 'block') {
            query = `
                SELECT 
                    tb.id,
                    tb.target_quantity,
                    tb.start_date,
                    tb.end_date,
                    tb.created_at,
                    b.Block_Name AS block_name,
                    u.username AS created_by_name
                FROM target_block tb
                LEFT JOIN master_block b ON tb.block_id = b.id
                LEFT JOIN users_customuser u ON tb.created_by = u.id
            `;

            // Filter Logic for Block Table
            if (role === 'department_admin') {
                // Filter by department_id column in this table
                whereClauses.push("tb.target_department_id = ?");
                queryParams.push(department_id);
            } else if (role === 'district_admin') {
                whereClauses.push("tb.district_id = ?");
                queryParams.push(district_id);
            } else if (role === 'block_admin') {
                whereClauses.push("tb.block_id = ?");
                queryParams.push(block_id);
            }

        } 
        
        // D. TARGET LEVEL: PRODUCTION CENTER
        else if (target_level === 'productioncenter') {
            query = `
                SELECT 
                    tpc.id,
                    tpc.target_quantity,
                    tpc.start_date,
                    tpc.end_date,
                    tpc.created_at,
                    pc.name_of_production_centre AS production_center_name,
                    u.username AS created_by_name
                FROM target_productioncenter tpc
                LEFT JOIN productioncenter_productioncenter pc ON tpc.productioncenter_id = pc.id
                LEFT JOIN users_customuser u ON tpc.created_by = u.id
            `;

            // Filter Logic for Production Center Table
            if (role === 'department_admin') {
                // Filter by department_id column in this table
                whereClauses.push("tpc.target_department_id = ?");
                queryParams.push(department_id);
            } else if (role === 'district_admin') {
                whereClauses.push("tpc.district_id = ?");
                queryParams.push(district_id);
            } else if (role === 'block_admin') {
                whereClauses.push("tpc.block_id = ?");
                queryParams.push(block_id);
            }

        } else {
            return res.status(400).json({ success: false, error: "Invalid target_level provided." });
        }

        // ---------------------------------------------------------
        // 4. FINALIZE QUERY (Append WHERE clauses)
        // ---------------------------------------------------------
        if (whereClauses.length > 0) {
            query += " WHERE " + whereClauses.join(" AND ");
        }

        // Execute
        const [rows] = await db.query(query, queryParams);

        res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        console.error("❌ Target Details Error:", err);
        res.status(500).json({ success: false, error: "Server Error", details: err.message });
    }
};

exports.getFarmerDetails = async (req, res) => {
    try {
        // 1. Get Data from Token & Query Params
        const user = req.user || {};
        
        const role = req.query.role || user.role;
        
        // IDs can come from query params (for filtering) or the logged-in user's context
        const department_id = req.query.department_id || user.department_id;
        const district_id = req.query.district_id || user.district_id;
        const block_id = req.query.block_id || user.block_id;

        // ---------------------------------------------------------
        // 2. VALIDATION
        // ---------------------------------------------------------
        
        // Validate required IDs based on role
        if (role === 'department_admin' && !department_id) {
            return res.status(400).json({ success: false, error: "Department ID is required for Department Admin." });
        }
        if (role === 'district_admin' && !district_id) {
            return res.status(400).json({ success: false, error: "District ID is required for District Admin." });
        }
        if (role === 'block_admin' && !block_id) {
            return res.status(400).json({ success: false, error: "Block ID is required for Block Admin." });
        }

        // ---------------------------------------------------------
        // 3. PREPARE QUERY VARIABLES
        // ---------------------------------------------------------
        
        // Selecting the required fields: farmerID, district name, block name, village name
        // Added basic farmer details (name, type) for context
        let query = `
            SELECT 
                f.id,
                f.farmer_id,
                f.name,
                f.type,
                md.District_Name AS district_name,
                mb.Block_Name AS block_name,
                mv.Village_Name AS village_name
            FROM users_farmeraathardetails f
            LEFT JOIN master_district md ON f.district_id = md.id
            LEFT JOIN master_block mb ON f.block_id = mb.id
            LEFT JOIN master_village mv ON f.village_id = mv.id
        `;

        let whereClauses = [];
        let queryParams = [];

        // ---------------------------------------------------------
        // 4. DYNAMIC QUERY BUILDER (Role-Based Filtering)
        // ---------------------------------------------------------

        if (role === 'superadmin') {
            // Superadmin: Show all data (No WHERE clauses needed)
        } 
        else if (role === 'department_admin') {
            // Department Admin: Filter by department_id column in farmers table (Column 21)
            whereClauses.push("f.department_id = ?");
            queryParams.push(department_id);
        } 
        else if (role === 'district_admin') {
            // District Admin: Filter by district_id
            whereClauses.push("f.district_id = ?");
            queryParams.push(district_id);
        } 
        else if (role === 'block_admin') {
            // Block Admin: Filter by block_id
            whereClauses.push("f.block_id = ?");
            queryParams.push(block_id);
        } 
        else {
            // Optional: Handle unknown roles or default behavior
            // For now, returning empty if role is not recognized or unauthorized
            return res.status(403).json({ success: false, error: "Unauthorized role access." });
        }

        // Append WHERE clauses if any exist
        if (whereClauses.length > 0) {
            query += " WHERE " + whereClauses.join(" AND ");
        }

        // Sort by latest entry
        query += " ORDER BY f.id DESC";

        // ---------------------------------------------------------
        // 5. EXECUTE QUERY
        // ---------------------------------------------------------
        const [rows] = await db.query(query, queryParams);

        res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (err) {
        console.error("❌ Farmer Details Error:", err);
        res.status(500).json({ success: false, error: "Server Error", details: err.message });
    }
};


// production-center dahsboard =---------------------

exports.getProductionCenterStats = async (req, res) => {
  try {
    const { production_center_id } = req.query;
    const pid = production_center_id ?? null;

    const query = `
      SELECT
        u.production_center_id,
        COALESCE(tpc.target_quantity, 0) AS target_quantity,
        COALESCE(tpc.start_date, NULL) AS start_date,
        COALESCE(tpc.end_date, NULL) AS end_date,
        COALESCE(cu.username, NULL) AS created_by_name,
        COALESCE(SUM(status IN ('order-placed','order-billed')), 0) AS order_placed_count,
        COALESCE(SUM(status = 'billed'), 0) AS billed_count,
        COALESCE(SUM(status = 'pending'), 0) AS pending_count
      FROM users_farmerrequest u
      LEFT JOIN target_productioncenter tpc
        ON tpc.productioncenter_id = u.production_center_id
      LEFT JOIN users_customuser cu
        ON tpc.created_by = cu.id
      WHERE (? IS NULL OR u.production_center_id = ?)
      GROUP BY u.production_center_id, tpc.target_quantity, tpc.start_date, tpc.end_date, cu.username
      ORDER BY u.production_center_id ASC;
    `;

    const params = [pid, pid];
    console.log('getProductionCenterStats params:', params);

    const [rows] = await db.query(query, params);
    console.log('getProductionCenterStats rows:', rows);

    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("❌ Stats Error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch production center stats", details: err.message });
  }
};



exports.getProductionCenterSaplings = async (req, res) => {
  try {
    const { production_center_id } = req.query;
    const pid = production_center_id ?? null;

    const query = `
      SELECT
        ps.species_id,
        t.name,
        ps.saplings_available,
        ps.sapling_age
      FROM productioncenter_stockdetails ps
      LEFT JOIN tbl_agroforest_trees t
        ON ps.species_id = t.id
      WHERE (? IS NULL OR ps.production_center_id = ?)
      ORDER BY ps.species_id ASC;
    `;

    const params = [pid, pid];
    const [rows] = await db.query(query, params);

    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("❌ Saplings Error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch sapling details", details: err.message });
  }
};


exports.getMonthlyTotalSales = async (req, res) => {
  try {
    const { production_center_id, year } = req.query;
    const pid = production_center_id ?? null;
    const yy = year ? Number(year) : new Date().getFullYear();

    const query = `
      SELECT
        MONTH(ps.updated_at) AS month,
        SUM(COALESCE(ps.total_selled,0)) AS total_selled,
        SUM(COALESCE(ps.total_selled_price,0.00)) AS total_selled_price
      FROM productioncenter_stockdetails ps
      WHERE (? IS NULL OR ps.production_center_id = ?)
        AND YEAR(ps.updated_at) = ?
      GROUP BY MONTH(ps.updated_at)
      ORDER BY MONTH(ps.updated_at);
    `;

    const params = [pid, pid, yy];
    const [rows] = await db.query(query, params);

    // Build full months 1..12 with zeros where missing
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const r = rows.find(rr => Number(rr.month) === m);
      return {
        month: m,
        total_selled: r ? Number(r.total_selled) : 0,
        total_selled_price: r ? Number(r.total_selled_price) : 0
      };
    });

    res.status(200).json({ success: true, year: yy, count: months.length, data: months });
  } catch (err) {
    console.error("❌ Monthly Total Sales Error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch monthly total sales", details: err.message });
  }
};




