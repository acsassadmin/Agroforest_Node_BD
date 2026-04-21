const db = require("../../db"); // Make sure this path points to your db config
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const sendOtpEmail = require('../../utils/mailer');
const redisClient = require('../../redisClient');
const { sendOtpSms, sendBillLinkSms, sendApprovalSms } = require('../../utils/sendSms');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const cache = new NodeCache({ stdTTL: 180 });
const axios = require('axios');

async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await axios.get(url, { headers: { 'User-Agent': 'YourAppName/1.0' } });

    if (response.data && response.data.length > 0) {
      return {
        latitude: parseFloat(response.data[0].lat),
        longitude: parseFloat(response.data[0].lon)
      };
    }
  } catch (err) {
    console.error("Geocoding failed:", err);
  }
  // Fallback to null if geocoding fails
  return { latitude: null, longitude: null };
}
// ===================== AUTH =====================

// // REGISTER (SEND OTP)
// exports.register = async (req, res) => {
//   try {
//     // 1. Destructure Email along with other fields
//     const { username, password, phone, role, email } = req.body;

//     // 2. Validate required fields
//     if (!phone || !password || !email) {
//       return res.status(400).json({ message: 'Phone, Password, and Email are required' });
//     }

//     // 3. Normalize & validate phone
//     const pn = parsePhoneNumberFromString(phone, 'IN');
//     if (!pn || !pn.isValid()) return res.status(400).json({ message: 'Invalid phone number' });
//     const e164 = pn.number; // e.g., +919789754800

//     // 4. Check if user exists by Phone
//     const [existingPhone] = await db.query('SELECT id FROM users_customuser WHERE phone = ?', [e164]);
//     if (existingPhone.length > 0) {
//       return res.status(400).json({ message: 'User with this phone already exists.' });
//     }

//     // 5. Check if user exists by Email (New Check)
//     const [existingEmail] = await db.query('SELECT id FROM users_customuser WHERE email = ?', [email]);
//     if (existingEmail.length > 0) {
//       return res.status(400).json({ message: 'User with this email already exists.' });
//     }

//     // 6. Generate OTP and hashed password
//     // const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // 7. Include Email in the pending object
//     // const pending = { 
//     //   username, 
//     //   phone: e164, 
//     //   email, // Added Email
//     //   password: hashedPassword, 
//     //   role_id: role, 
//     //   otp 
//     // };
//     const insertQuery = `
//       INSERT INTO users_customuser
//         (username, phone, email, password, role_id, is_active, is_superuser, first_name, date_joined)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
//     `;
//     // Note above: I added an extra '?' before CURRENT_TIMESTAMP to match the 'first_name' column.

//     await db.query(insertQuery, [
//       username,   // 1. ?
//       phone,      // 2. ?
//       email,      // 3. ?
//       hashedPassword,   // 4. ?
//       role,    // 5. ?
//       true,                  // 6. ?
//       false,                 // 7. ?
//       null                   // 8. ? (This is for first_name)
//                              // 9. CURRENT_TIMESTAMP is handled by SQL
//     ]);
//     // 8. Store in Redis with 10 min TTL
//     // await redisClient.set(`register_${e164}`, JSON.stringify(pending), { EX: 600 });

//     // 9. Send SMS (uncomment when ready)
//     // await sendOtpSms(e164, otp);

//     return res.status(200).json({ message: 'OTP sent to phone' });
//   } catch (err) {
//     console.error('Registration Error:', err);
//     return res.status(500).json({ error: err.message });
//   }
// };

// // VERIFY OTP
// exports.verifyOtp = async (req, res) => {
//   try {
//     const { phone, otp } = req.body;
//     if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP required' });

//     // 1. Normalize Phone
//     const pn = parsePhoneNumberFromString(phone, 'IN');
//     if (!pn || !pn.isValid()) return res.status(400).json({ message: 'Invalid phone number' });
//     const e164 = pn.number; 

//     // 2. Get Cached Data from Redis
//     const cachedDataString = await redisClient.get(`register_${e164}`);
//     if (!cachedDataString) {
//       return res.status(400).json({ message: 'OTP expired or invalid request. Please register again.' });
//     }

//     const cachedData = JSON.parse(cachedDataString);

//     // 3. Verify OTP
//     if (cachedData.otp !== otp) {
//       return res.status(400).json({ message: 'Invalid OTP' });
//     }

//     // 4. Insert into Database
//     // COLUMNS: username, phone, email, password, role_id, is_active, is_superuser, first_name, date_joined
//     // COUNT: 9 Columns

//     const insertQuery = `
//       INSERT INTO users_customuser
//         (username, phone, email, password, role_id, is_active, is_superuser, first_name, date_joined)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
//     `;
//     // Note above: I added an extra '?' before CURRENT_TIMESTAMP to match the 'first_name' column.

//     await db.query(insertQuery, [
//       cachedData.username,   // 1. ?
//       cachedData.phone,      // 2. ?
//       cachedData.email,      // 3. ?
//       cachedData.password,   // 4. ?
//       cachedData.role_id,    // 5. ?
//       true,                  // 6. ?
//       false,                 // 7. ?
//       null                   // 8. ? (This is for first_name)
//                              // 9. CURRENT_TIMESTAMP is handled by SQL
//     ]);

//     // 5. Cleanup Redis
//     await redisClient.del(`register_${e164}`);
//     res.status(201).json({ message: "User registered successfully" });

//   } catch (err) {
//     console.error("Verify OTP Error:", err);
//     if (err.code === 'ER_DUP_ENTRY') {
//       return res.status(400).json({ message: 'User already exists.' });
//     }
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     // 1. Query with JOINs to get Role Name, Production Center ID, and Status
//     // This query runs directly against the DB every time. No cache here.
//    const query = `
//       SELECT 
//         u.id, 
//         u.username, 
//         u.password,
//         u.role_id,
//         r.name as role_name,
//         pc.id as production_center_id,
//         pc.status as production_center_status,
//         u.department_id,
//         u.district_id,
//         u.block_id
//       FROM users_customuser u
//       LEFT JOIN users_role r ON u.role_id = r.id
//       LEFT JOIN productioncenter_productioncenter pc ON pc.created_by_id = u.id
//       WHERE u.email = ?
//     `;

//     const [users] = await db.query(query, [email]);

//     if (users.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     const user = users[0];

//     // 2. Compare Password
//     const match = await bcrypt.compare(password, user.password);
//     if (!match) {
//       return res.status(400).json({ error: "Wrong password" });
//     }

//     // --- Define Secrets ---
//     const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
//     const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

//     const accessToken = jwt.sign(
//       { 
//         id: user.id, 
//         role: user.role_name,
//         department_id: user.department_id,
//         district_id: user.district_id,
//         block_id: user.block_id
//       },
//       JWT_SECRET,
//       { expiresIn: '2h' }
//     );

//     const refreshToken = jwt.sign(
//       { id: user.id },
//       JWT_REFRESH_SECRET,
//       { expiresIn: '7d' }
//     );

//     // 5. Send Response (Added new fields here)
//     res.json({
//       access: accessToken,
//       refresh: refreshToken,
//       user_id: user.id,
//       role: user.role_name,             
//       user_name: user.username,
//       production_center_id: user.production_center_id || null,
//       production_center_status: user.production_center_status || null,
//       // New fields added below:
//       department_id: user.department_id || null,
//       district_id: user.district_id || null,
//       block_id: user.block_id || null
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// };


// ==========================================
// HELPER FUNCTION: FORMAT INDIAN PHONE
// ==========================================
// Call this whenever you receive a phone number from frontend
const formatIndianPhone = (phone) => {
  if (!phone) return null;
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');

  // If user sent 12 digits starting with 91 (e.g., 919876543210)
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.substring(2);
  }

  // Validate exactly 10 digits
  if (digits.length !== 10) return null;

  // Return standard format to save in DB
  return `+91${digits}`;
};


// ==========================================
// SEND LOGIN OTP
// ==========================================
exports.sendLoginOtp = async (req, res) => {
  try {
    const { phone, expected_role_group } = req.body; // ✅ GRAB expected_role_group
    if (!phone) return res.status(400).json({ message: 'Phone is required' });

    const formattedPhone = formatIndianPhone(phone);
    if (!formattedPhone) return res.status(400).json({ message: 'Invalid phone number' });

    const [rows] = await db.query(
      `SELECT u.id, u.username, u.email, u.password, u.role_id, 
              r.name as role_name, u.department_id, u.district_id, u.block_id, md.District_Name , mb.Block_Name , 
              pc.id as production_center_id, pc.status as production_center_status , pc.production_type
       FROM users_customuser u
       LEFT JOIN users_role r ON u.role_id = r.id
       LEFT JOIN productioncenter_productioncenter pc ON pc.created_by_id = u.id
       LEFT JOIN master_district md ON md.id = u.district_id
       LEFT JOIN master_block mb ON mb.id = u.block_id


       WHERE u.phone = ?`,
      [formattedPhone]
    );

    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = rows[0];

    // ==========================================
    // ✅ NEW: RESTRICT BASED ON PORTAL SELECTED
    // ==========================================
    if (expected_role_group === 'production_center') {
      if (user.role_name !== 'productioncenter') {
        return res.status(403).json({ message: 'Access Denied: This portal is strictly for Production Centers.' });
      }
    } else if (expected_role_group === 'officer') {
      const allowedOfficerRoles = ['superadmin', 'district_admin', 'department_admin', 'block_admin','field_inspector'];
      if (!allowedOfficerRoles.includes(user.role_name)) {
        return res.status(403).json({ message: 'Access Denied: This portal is strictly for Officers.' });
      }
    }

    const otp = "987654";

    const payload = {
      user_id: user.id,
      phone: formattedPhone,
      otp,
      username: user.username,
      role_id: user.role_id,
      role_name: user.role_name,
      department_id: user.department_id,
      district_id: user.district_id,
      district_name : user.District_Name,
      block_id: user.block_id,
      block_name :user.Block_Name,
       production_center_id: user.production_center_id,
      production_center_status: user.production_center_status,
      production_type : user.production_type
    };
    console.log(payload,"payload");

    await redisClient.set(`login_${formattedPhone}`, JSON.stringify(payload), { EX: 600 });
    // await sendOtpSms(formattedPhone, otp);
    console.log(otp,"otp")
    return res.status(200).json({ message: 'OTP sent to phone', otp });
  } catch (err) {
    console.error('sendLoginOtp Error:', err);
    return res.status(500).json({ error: err.message });
  }
};


// ==========================================
// VERIFY LOGIN OTP
// ==========================================
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP required' });

    // Standardize the phone number
    const formattedPhone = formatIndianPhone(phone);
    if (!formattedPhone) return res.status(400).json({ message: 'Invalid phone number' });

    // Fetch cached payload from Redis using formatted phone
    const cached = await redisClient.get(`login_${formattedPhone}`);
    if (!cached) return res.status(400).json({ message: 'OTP expired or invalid. Request a new OTP.' });

    const data = JSON.parse(cached);
    if (data.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });

    // Use cached user info
    const user = {
      id: data.user_id,
      username: data.username,
      role_id: data.role_id,
      role_name: data.role_name,
      department_id: data.department_id,
      district_id: data.district_id,
    district_name : data.district_name,
      block_id: data.block_id,
      block_name :data.block_name,
      production_center_id: data.production_center_id || null,
      production_center_status: data.production_center_status || null ,
      production_type : data.production_type || null
    };

    // Issue JWTs
    const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
    const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

    const accessToken = jwt.sign({
      id: user.id, role: user.role_name, department_id: user.department_id,
      district_id: user.district_id, block_id: user.block_id
    }, JWT_SECRET, { expiresIn: '2h' });

    const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Delete OTP from Redis
    await redisClient.del(`login_${formattedPhone}`);

    return res.json({
      access: accessToken,
      refresh: refreshToken,
      user_id: user.id,
      role: user.role_name,
      user_name: user.username,
      phone: formattedPhone, // Return +91XXXXXXXXXX to frontend
      production_center_id: user.production_center_id,
      production_center_status: user.production_center_status,
      department_id: user.department_id || null,
      district_id: user.district_id || null,
      block_id: user.block_id || null,
       district_name : user.district_name || null,
      block_id: user.block_id || null,
      block_name :user.block_name || null,
      production_type : user.production_type || null 
    });

  } catch (err) {
    console.error('verifyLoginOtp Error:', err);
    return res.status(500).json({ error: err.message });
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
    console.log(phone, "phone")
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

// ==========================================
// 1. GET FARMER BY AADHAAR (EXISTING - KEEP AS IS)
// ==========================================
exports.getFarmerAadhar = async (req, res) => {
  try {
    const { aadhar_no } = req.body;

    if (aadhar_no) {
      // 1. Check in FARMER table and get ALL values
      const [farmerRows] = await db.query(
        `SELECT id, farmer_id, farmer_name, father_name, mobile_number, 
                social_status, gender, address, caste_category, dob, 
                village_id,  district_id 
         FROM farmer WHERE aadhaar = ?`,
        [aadhar_no]
      );

      if (!farmerRows.length) {
        // If not in farmer table, return 404 so frontend goes to Non-Farmer form
        return res.status(404).json({ error: "Your credentials are not registered. Please complete the registration to proceed." });
      }

      const farmer = farmerRows[0];
      const farmerPk = farmer.id; // Use the actual PK (integer) for lands
      console.log(farmer.id, "farmer_id")
      // 2. Fetch Land Details using the Farmer PK
      const [landRows] = await db.query(
        `SELECT * FROM farmer_land_details WHERE farmer_id = ?`,
        [farmerPk]
      );

      // 3. Format Farmer Data
      const formattedFarmer = {
        farmerId: farmer.farmer_id || `FAR${farmerPk}`,
        farmerName: farmer.farmer_name,
        fatherName: farmer.father_name,
        mobileNumber: farmer.mobile_number,
        socialStatus: farmer.social_status,
        gender: farmer.gender,
        address: farmer.address,
        caste_category: farmer.caste_category,
        dob: farmer.dob,
        village_name: farmer.village_id,
        district_name: farmer.district_id
      };

      // 4. Format Land Data
      const formattedLands = landRows.map(land => ({
        landId: land.land_id,
        lgdDistrictCode: land.lgd_district_code,
        lgdSubDistrictCode: land.lgd_sub_district_code,
        lgdVillageCode: land.lgd_village_code,
        villageName: land.village_name,
        surveyNo: land.survey_no,
        subDivNo: land.sub_div_no,
        area: land.area,
        village_id: land.village_id,
        District: String(land.district_id),
        Block: String(land.block_id),
        landType: land.land_type,
        pattaNo: land.patta_no
      }));

      // 5. Return ONLY the data (No tokens)
      return res.json({
        status: "success",
        data: {
          farmer: formattedFarmer,
          lands: formattedLands
        },
        message: "Requested Data Available"
      });
    }



  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// exports.getAadhar = async (req, res) => {
//   try {
//     const { aadhar_no } = req.query;

//     if (aadhar_no) {
//       const [aadhaarRows] = await db.query(
//         `SELECT * FROM users_farmeraathardetails WHERE aadhar_no = ?`,
//         [aadhar_no]
//       );

//       if (!aadhaarRows.length) {
//         return res.status(404).json({ error: "Invalid credentials. Please register your Aadhaar to proceed." });
//       }
//       console.log(aadhaarRows[0] , "aadhaarRows")
//       const { farmer_id , user_id ,district_id , block_id , farmer_name , department_id} = aadhaarRows[0];
//       console.log(user_id , "farmer")
//       // if (!farmer_id) {
//       //   return res.status(404).json({ error: "Aadhaar found, but not linked to a farmer profile yet." });
//       // }

//       // const [farmerRows] = await db.query(
//       //   `SELECT * FROM farmer WHERE id = ?`,
//       //   [farmer_id]
//       // );

//       // const [landRows] = await db.query(
//       //   `SELECT * FROM farmer_land_details WHERE farmer_id = ?`,
//       //   [farmer_id]
//       // );

//       // if (!farmerRows.length) {
//       //   return res.status(404).json({ error: "Farmer profile missing in farmer table." });
//       // }

//       // const farmer = farmerRows[0];

//       // const formattedFarmer = {
//       //   farmerId: farmer.farmer_id || `FAR${farmer.id}`,
//       //   farmerName: farmer.farmer_name,
//       //   fatherName: farmer.father_name,
//       //   mobileNumber: farmer.mobile_number,
//       //   socialStatus: farmer.social_status,
//       //   gender: farmer.gender,
//       //   address: farmer.address,
//       //   caste_category: farmer.caste_category,
//       //   dob: farmer.dob,
//       //   village_name: farmer.village_name,
//       //   taluk_name: farmer.taluk_name,
//       //   district_name: farmer.district_name
//       // };

//       // const formattedLands = landRows.map(land => ({
//       //   landId: land.land_id,
//       //   lgdDistrictCode: land.lgd_district_code,
//       //   lgdSubDistrictCode: land.lgd_sub_district_code,
//       //   lgdVillageCode: land.lgd_village_code,
//       //   villageName: land.village_name,
//       //   surveyNo: land.survey_no,
//       //   subDivNo: land.sub_div_no,
//       //   area: land.area,
//       //   village_id: land.village_id,
//       //   District: String(land.district_id),
//       //   Block: String(land.block_id),
//       //   landType: land.land_type,
//       //   pattaNo: land.patta_no
//       // }));

//       const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
//       const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

//       const accessToken = jwt.sign({
//         id: user_id,
//         role: 'farmer',
//         district_id:district_id || null,
//         block_id: block_id || null
//       }, JWT_SECRET, { expiresIn: '2h' });

//       const refreshToken = jwt.sign({ id: user_id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

//       return res.json({
//         status: "success",
//         // data: {
//         //   farmer: formattedFarmer,
//         //   lands: formattedLands
//         // },
//         message: "Requested Data Available",
//         access: accessToken,
//         refresh: refreshToken,
//         user_id: user_id,
//         role: 'farmer',
//         user_name: farmer_name,
//         production_center_id: null,
//         production_center_status: null,
//         department_id:department_id || null,
//         district_id: district_id || null,
//         block_id: block_id || null
//       });
//     }

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// };
// ==========================================
// 2. CHECK AADHAAR FOR REGISTRATION
// ==========================================


// exports.getAadhar = async (req, res) => {
//   try {
//     const { aadhar_no } = req.body;

//     if (!aadhar_no) {
//       return res.status(400).json({ error: "Aadhaar number is required." });
//     }

//     // Query the Aadhaar table
//     const [aadhaarRows] = await db.query(
//       `SELECT * FROM users_farmeraathardetails WHERE aadhar_no = ?`,
//       [aadhar_no]
//     );

//     if (!aadhaarRows.length) {
//       return res.status(404).json({
//         error: "Invalid credentials. Please register your Aadhaar to proceed."
//       });
//     }

//     const { farmer_id, user_id, district_id, block_id, farmer_name, department_id } = aadhaarRows[0];

//     // JWT secrets
//     const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
//     const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

//     // Create tokens
//     const accessToken = jwt.sign(
//       {
//         id: user_id,
//         role: 'farmer',
//         district_id: district_id || null,
//         block_id: block_id || null,
//         department_id: department_id || null
//       },
//       JWT_SECRET,
//       { expiresIn: '2h' }
//     );

//     const refreshToken = jwt.sign(
//       { id: user_id },
//       JWT_REFRESH_SECRET,
//       { expiresIn: '7d' }
//     );

//     // Send response exactly in the desired format
//     return res.json({
//       status: "success",
//       message: "Requested Data Available",
//       access: accessToken,
//       refresh: refreshToken,
//       user_id: user_id,
//       role: 'farmer',
//       user_name: farmer_name,
//       department_id: department_id || null,
//       district_id: district_id || null,
//       block_id: block_id || null,
//       production_center_id: null,
//       production_center_status: null
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
//   };


exports.getAadhar = async (req, res) => {
  try {
    const { aadhar_no } = req.body;

    //  Validate input
    if (!aadhar_no) {
      return res.status(400).json({ error: "Aadhaar number is required." });
    }

    //  Get Aadhaar details
    const [aadhaarRows] = await db.query(
      `SELECT * FROM users_farmeraathardetails WHERE aadhar_no = ?`,
      [aadhar_no]
    );

    if (!aadhaarRows.length) {
      return res.status(404).json({
        error: "Invalid credentials. Please register your Aadhaar to proceed."
      });
    }

    const {
      farmer_id,
      user_id,
      district_id,
      block_id,
      farmer_name,
      department_id
    } = aadhaarRows[0];

    //  Fetch farmer lands
    const [landRows] = await db.query(
      `SELECT 
        land_id AS landId,
        lgd_district_code AS lgdDistrictCode,
        lgd_sub_district_code AS lgdSubDistrictCode,
        lgd_village_code AS lgdVillageCode,
        village_name AS villageName,
        survey_no AS surveyNo,
        sub_div_no AS subDivNo,
        area,
        village_id,
        district_id AS district,
        block_id AS block
      FROM farmer_land_details
      WHERE farmer_id = ?`,
      [farmer_id]
    );

    // Extract land IDs
    const landIds = landRows.map(land => land.landId);

    // Fetch patta lands using landRef
    let pattaLandRows = [];

    if (landIds.length > 0) {
      const [rows] = await db.query(
        `SELECT
          areaHa AS areaSQ,
          landType,
          pattaNo AS pattaNO,
          landRef
         FROM patta_cita
         WHERE landRef IN (?)`,
        [landIds]
      );

      pattaLandRows = rows;
    }

    // Map patta lands to each land
    const landsWithPatta = landRows.map(land => {
      const relatedPatta = pattaLandRows.filter(
        p => p.landRef === land.landId
      );

      return {
        ...land,
        pattaLands: relatedPatta
      };
    });

    //  JWT secrets
    const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
    const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

    //  Generate tokens
    const accessToken = jwt.sign(
      {
        id: user_id,
        role: 'farmer',
        district_id: district_id || null,
        block_id: block_id || null,
        department_id: department_id || null
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    const refreshToken = jwt.sign(
      { id: user_id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    //  Final response
    return res.json({
      status: "success",
      message: "Requested Data Available",
      access: accessToken,
      refresh: refreshToken,
      user_id: user_id,
      role: 'farmer',
      user_name: farmer_name,
      department_id: department_id || null,
      district_id: district_id || null,
      block_id: block_id || null,
      production_center_id: null,
      production_center_status: null,
      lands: landsWithPatta || []
    });

  } catch (err) {
    console.error("Error in getAadhar:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      details: err.message
    });
  }
};



exports.checkAadharForRegistration = async (req, res) => {
  try {
    const { aadhar_no } = req.body;

    if (!aadhar_no || aadhar_no.length !== 12) {
      return res.status(400).json({ error: "Valid 12-digit Aadhaar required" });
    }


            //  Check if Aadhaar exists in farmer table
    const [farmerRows] = await db.query(
      `SELECT id, farmer_id, farmer_name, father_name, mobile_number, 
              district_id, block_id, village_id, social_status, gender, 
              address, caste_category, dob 
       FROM farmer WHERE aadhaar = ?`,
      [aadhar_no]
    );

    if (farmerRows.length === 0) {
      return res.json({
        status: "not_found",
        message: "Aadhaar not found in farmer database. Please complete registration.",
        isVerified: false
      });
    }

    const farmer = farmerRows[0];

    // 2. Check if already exists in users_farmeraathardetails
    const [existingEntry] = await db.query(
      `SELECT id, type, user_id FROM users_farmeraathardetails WHERE aadhar_no = ?`,
      [aadhar_no]
    );
    if (existingEntry.length > 0) {
      return res.json({
        status: "already_registered",
        message: "Aadhaar already registered. Please login with Aadhaar.",
        isVerified: true
      });
    }

    // 3. Check if mobile number is already in users_customuser
    const [existingUser] = await db.query(
      `SELECT id FROM users_customuser WHERE phone = ?`,
      [farmer.mobile_number]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({
        error: "Mobile number already linked to another account. Please contact support."
      });
    }

    // 4. Create user in users_customuser
    const dummyEmail = `farmer_${farmer.mobile_number}@temp.com`;
    const [userResult] = await db.query(
      `INSERT INTO users_customuser (phone, email, username, is_active, role_id) 
       VALUES (?, ?, ?, 1, ?)`,
      [farmer.mobile_number, dummyEmail, farmer.farmer_name, 4]
    );
    const newUserPk = userResult.insertId;

    // 5. Fetch location names from database for better geocoding
    let fullAddress = farmer.address || '';
    
    try {
      // Fetch district, block, village names
      let districtName = '';
      let blockName = '';
      let villageName = '';
      let stateName = ''; // Add your state if needed

      if (farmer.village_id) {
        const [village] = await db.query(
          `SELECT name FROM village WHERE id = ?`, 
          [farmer.village_id]
        );
        if (village.length > 0) villageName = village[0].name;
      }

      if (farmer.block_id) {
        const [block] = await db.query(
          `SELECT name FROM block WHERE id = ?`, 
          [farmer.block_id]
        );
        if (block.length > 0) blockName = block[0].name;
      }

      if (farmer.district_id) {
        const [district] = await db.query(
          `SELECT name FROM district WHERE id = ?`, 
          [farmer.district_id]
        );
        if (district.length > 0) districtName = district[0].name;
      }

      // Build comprehensive address for geocoding
      const addressParts = [
        farmer.address,
        villageName,
        blockName,
        districtName,
        'Odisha', // Change to your state
        'India'
      ].filter(part => part && part.trim() !== '');

      fullAddress = addressParts.join(', ');
      console.log('Full address for geocoding:', fullAddress);

    } catch (locErr) {
      console.error("Error fetching location names:", locErr);
    }

    // 6. Fetch lat/lng using multiple geocoding services as fallback
    let latitude = null;
    let longitude = null;

    // Try Nominatim first (better for Indian addresses)
    const geocodingResult = await getCoordinatesFromAddress(fullAddress);
    
    if (geocodingResult) {
      latitude = geocodingResult.lat;
      longitude = geocodingResult.lng;
      console.log(`Geocoded: ${latitude}, ${longitude}`);
    } else {
      console.log('Geocoding failed for address:', fullAddress);
    }

    // 7. Insert into users_farmeraathardetails with lat/lng
    await db.query(
      `INSERT INTO users_farmeraathardetails 
       (aadhar_no, address, farmer_name, mobile_number, district_id, block_id, village_id, type, user_id, latitude, longitude, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'farmer', ?, ?, ? , NOW())`,
      [aadhar_no, farmer.address, farmer.farmer_name, farmer.mobile_number, farmer.district_id, farmer.block_id, farmer.village_id, newUserPk, latitude, longitude]
    );

    // 8. Generate JWT tokens
    const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
    const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

    const accessToken = jwt.sign({
      id: newUserPk,
      role: 'farmer',
      district_id: farmer.district_id || null,
      block_id: farmer.block_id || null
    }, JWT_SECRET, { expiresIn: '2h' });

    const refreshToken = jwt.sign({ id: newUserPk }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // 9. Send response
    return res.json({
      status: "linked_and_logged_in",
      message: "Aadhaar verified and linked successfully!",
      isVerified: true,
      access: accessToken,
      refresh: refreshToken,
      user_id: newUserPk,
      role: 'farmer',
      user_name: farmer.farmer_name,
      farmer_id: farmer.farmer_id || `FAR${farmer.id}`,
      production_center_id: null,
      production_center_status: null,
      department_id: null,
      district_id: farmer.district_id || null,
      block_id: farmer.block_id || null,
      latitude,
      longitude
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================
// SEPARATE GEOCODING FUNCTION WITH MULTIPLE FALLBACKS
// ============================================

async function getCoordinatesFromAddress(address) {
  // Method 1: Nominatim (OpenStreetMap) - Best for Indian addresses
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1,
        countrycodes: 'in' // Restrict to India only
      },
      headers: {
        'User-Agent': 'YourAppName/1.0'
      },
      timeout: 10000
    });

    if (response.data && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon)
      };
    }
    console.log('Nominatim returned no results');
  } catch (err) {
    console.error('Nominatim error:', err.message);
  }

  // Method 2: Photon API (Fallback)
  try {
    const response = await axios.get('https://photon.komoot.io/api/', {
      params: {
        q: address,
        limit: 1
      },
      headers: {
        'User-Agent': 'YourAppName/1.0'
      },
      timeout: 10000
    });

    if (response.data && response.data.features && response.data.features.length > 0) {
      const coords = response.data.features[0].geometry.coordinates;
      return {
        lat: coords[1],
        lng: coords[0]
      };
    }
    console.log('Photon returned no results');
  } catch (err) {
    console.error('Photon error:', err.message);
  }

  // Method 3: Try with simplified address (remove house numbers, etc.)
  try {
    // Remove common patterns that confuse geocoders
    const simplifiedAddress = address
      .replace(/house\s*no\.?\s*\d+/gi, '')
      .replace(/ward\s*\d+/gi, '')
      .replace(/plot\s*no\.?\s*\d+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (simplifiedAddress !== address) {
      console.log('Trying simplified address:', simplifiedAddress);
      return await getCoordinatesFromAddress(simplifiedAddress);
    }
  } catch (err) {
    console.error('Simplification error:', err.message);
  }

  return null;
}


// ==========================================
// 3. REGISTER NON-FARMER (UPDATED WITH LAT/LNG)
// ==========================================


exports.registerNonFarmer = async (req, res) => {
  try {
    const { 
      aadhar_no,
      address,
      district_id,
      farmer_name,
      latitude,
      longitude,
      mobile_number,
      purpose,
    } = req.body;

    // Validate required fields
    if (!aadhar_no || !farmer_name || !mobile_number || !district_id) {
      return res.status(400).json({ error: "Name, Mobile, Aadhaar, and District are required" });
    }

    if (aadhar_no.length !== 12) {
      return res.status(400).json({ error: "Invalid Aadhaar number" });
    }



    // Check if Aadhaar already exists in farmer table
    const [existingFarmer] = await db.query(
      `SELECT id FROM farmer WHERE aadhaar = ?`,
      [aadhar_no]
    );
    if (existingFarmer.length > 0) {
      return res.status(400).json({ error: "Aadhaar already exists in farmer database. Please use login." });
    }

    // Check if phone number already exists in users_customuser
    const [existingUser] = await db.query(
      `SELECT id FROM users_customuser WHERE phone = ?`,
      [mobile_number]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Mobile number already registered." });
    }

    // Generate non_farmer_id (NFAR + next ID)
    const [maxId] = await db.query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM users_farmeraathardetails`);
    const newNonFarmerId = `NFAR${maxId[0].next_id}`;

    const dummyEmail = `nonfarmer_${mobile_number}@temp.com`;

    const [userResult] = await db.query(
      `INSERT INTO users_customuser 
       (phone, email, username, is_active, role_id) 
       VALUES (?, ?, ?, 1, ?)`,
      [mobile_number, dummyEmail, farmer_name, 4]
    );
    const newUserPk = userResult.insertId;

    

    if (address) {
      try {
        const geoRes = await axios.get('https://photon.komoot.io/api/', {
          params: { q: address, limit: 1 },
          headers: { 'User-Agent': 'YourAppName/1.0' } // required by Photon
        });

        if (geoRes.data && geoRes.data.features && geoRes.data.features.length > 0) {
          const coords = geoRes.data.features[0].geometry.coordinates;
          longitude = coords[0]; // Photon returns [lon, lat]
          latitude = coords[1];
        }
      } catch (geoErr) {
        console.error("Geocoding failed:", geoErr.message);
      }
    }

    // 2. Insert into users_farmeraathardetails table
    await db.query(
      `INSERT INTO users_farmeraathardetails 
       (aadhar_no, non_farmer_id, farmer_name, purpose, mobile_number, district_id, address, latitude, longitude, type, user_id , created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'non-farmer', ? , NOW())`,
      [
        aadhar_no,
        newNonFarmerId,
        farmer_name,
        purpose,
        mobile_number,
        district_id,
        address,
        latitude,
        longitude,
        newUserPk
      ]
    );

    // Generate JWT tokens
    const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';
    const JWT_REFRESH_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

    const accessToken = jwt.sign({
      id: newUserPk,
      role: 'farmer',
      district_id: district_id || null,
      block_id: null
    }, JWT_SECRET, { expiresIn: '2h' });

    const refreshToken = jwt.sign({ id: newUserPk }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      status: "success",
      message: "Registration successful!",
      access: accessToken,
      refresh: refreshToken,
      user_id: newUserPk,
      role: 'farmer',
      user_name: farmer_name,
      farmer_id: newNonFarmerId,
      production_center_id: null,
      production_center_status: null,
      department_id: null,
      district_id: district_id || null,
      block_id: null,
      latitude,
      longitude
    });

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
    const { action, approved_quantity, type, scheme_id, schemed_rate } = req.body;

    console.log("Incoming Request:", { id, action, approved_quantity });

    let requestId = null;

    // =====================================================
    // ✅ APPROVE
    // =====================================================
    if (action === "approve") {

      if (approved_quantity === undefined || approved_quantity === null) {
        return res.status(400).json({ error: "Approved quantity is required" });
      }

      // 1. Update item (schemed_rate = total_amount)
      await connection.query(
        `UPDATE users_farmerrequestitem 
         SET approved_quantity = ?, 
             status = 'approved',
             type = ?,
             scheme_id = ?,
             schemed_rate = ?,
             total_amount = ?,
             final_quantity = ?
         WHERE id = ?`,
        [
          approved_quantity,
          type || 'non-scheme',
          type === 'scheme' ? scheme_id : null,
          schemed_rate || 0,
          schemed_rate || 0, // ✅ treated as total amount
          approved_quantity, // ✅ Set final_quantity equal to approved_quantity
          id
        ]
      );

      // 2. Get request + stock
      const [itemRows] = await connection.query(
        `SELECT stock_id, request_id 
         FROM users_farmerrequestitem 
         WHERE id = ?`,
        [id]
      );

      if (itemRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Item not found" });
      }

      const stockId = itemRows[0].stock_id;
      requestId = itemRows[0].request_id;

      // 3. Update stock
      await connection.query(
        `UPDATE productioncenter_stockdetails 
         SET allocated_quantity = allocated_quantity + ? 
         WHERE id = ?`,
        [approved_quantity, stockId]
      );

    }

    // =====================================================
    // ❌ REJECT
    // =====================================================
    else if (action === "reject") {

      await connection.query(
        `UPDATE users_farmerrequestitem 
         SET status = 'rejected', approved_quantity = 0, final_quantity = 0
         WHERE id = ?`,
        [id]
      );

      const [itemRows] = await connection.query(
        `SELECT request_id FROM users_farmerrequestitem WHERE id = ?`,
        [id]
      );

      if (itemRows.length > 0) {
        requestId = itemRows[0].request_id;
      }

    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    await connection.commit();
    console.log("✅ Transaction committed");

    // =====================================================
    // 📩 FETCH DATA FOR SMS
    // =====================================================
    if (requestId) {
      try {

        const [rows] = await db.query(
          `SELECT 
              u.phone,
              u.first_name,
              pc.name_of_production_centre AS pc_name,
              pc.complete_address AS pc_address,
              pc.contact_person,
              fri.status,
              fri.approved_quantity,
              fri.schemed_rate AS total_amount, -- ✅ using schemed_rate as total
              s.name AS species_name
           FROM users_farmerrequest fr
           JOIN users_customuser u ON fr.farmer_id = u.id
           JOIN users_farmerrequestitem fri ON fr.id = fri.request_id
           LEFT JOIN tbl_agroforest_trees s ON fri.species_id = s.id
           LEFT JOIN productioncenter_productioncenter pc ON fr.production_center_id = pc.id
           WHERE fr.id = ?`,
          [requestId]
        );

        if (rows.length > 0) {

          let approvedItems = [];
          let rejectedItems = [];
          let totalAmountSum = 0;

          rows.forEach(r => {
            if (r.status === 'approved') {
              approvedItems.push({
                name: r.species_name,
                qty: r.approved_quantity
              });

              totalAmountSum += Number(r.total_amount || 0); // ✅ consistent
            } else if (r.status === 'rejected') {
              rejectedItems.push({
                name: r.species_name
              });
            }
          });

          const farmer = rows[0];

          await sendApprovalSms(
            farmer.phone,
            farmer.first_name,
            farmer.pc_name,
            farmer.pc_address,
            farmer.contact_person,
            approvedItems,
            rejectedItems,
            totalAmountSum
          );
        }

      } catch (smsErr) {
        console.error("❌ SMS Error:", smsErr);
      }
    }

    // =====================================================
    // 🧹 CLEAR CACHE
    // =====================================================
    try {
      const keys = await redisClient.keys("stock_details_*");
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log("🧹 Cache cleared");
      }
    } catch (err) {
      console.error("Cache error:", err);
    }

    res.json({ message: "Updated successfully" });

  } catch (err) {
    await connection.rollback();
    console.error("❌ Approve Item Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};


exports.getCenterOrders = async (req, res) => {
  try {
    const { production_center_id, user_id, status, limit, offset } = req.query;

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
                fr.production_center_id,
                fr.status as order_status,
                fr.created_at as order_date,
                f.farmer_name as farmer_name,
                f.type as farmer_type,
                f.mobile_number as farmer_mobile,
                f.farmer_id as farmer_code,
                fri.id as item_id,
                fri.stock_id,
                fri.species_id,
                fri.requested_quantity,
                fri.approved_quantity,
                fri.status as item_status,
                fri.type,
                fri.scheme_id,
                t.name as species_name,
                t.name_tamil as species_name_tamil
            FROM users_farmerrequest fr
            JOIN users_farmerrequestitem fri ON fr.id = fri.request_id
            LEFT JOIN users_farmeraathardetails f ON fr.farmer_id = f.user_id
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
          farmer_type: row.farmer_type,
          farmer_mobile: row.farmer_mobile,
          production_center_id: row.production_center_id,
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
          item_status: row.item_status,
          type: row.type,
          scheme_id: row.scheme_id,

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
    const { status } = req.body;

    await db.query(
      `UPDATE users_farmerrequest SET status = ? WHERE id = ?`,
      [status, id]
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

    // ❌ removed type, scheme_id from header
    const { request_id, payment_type, total_amount, scheme_total_amount, items: itemUpdates } = req.body;

    // ✅ 1. Update item-level type & scheme_id
    if (itemUpdates && itemUpdates.length > 0) {
      for (const item of itemUpdates) {
        await connection.query(
          `UPDATE users_farmerrequestitem 
         SET type = ?, scheme_id = ?, schemed_rate = ?
         WHERE id = ?`,
          [
            item.type || 'non-scheme',
            item.type === 'scheme' ? item.scheme_id : null,
            item.schemed_rate || null,
            item.id
          ]
        );
      }
    }

    console.log("Incoming Order:", { request_id, payment_type, total_amount, scheme_total_amount });

    // ✅ 2. Update request header (REMOVED type & scheme_id)
    const [headerResult] = await connection.query(
      `UPDATE users_farmerrequest 
             SET status = 'billed', payment_type = ?, total_amount = ?, scheme_total_amount = ? 
             WHERE id = ?`,
      [payment_type, total_amount, scheme_total_amount, request_id]
    );

    console.log("Header Update Result:", headerResult);

    // ✅ 3. Get approved items WITH type & scheme
    const [approvedItems] = await connection.query(
      `SELECT 
                fri.stock_id, 
                fri.approved_quantity,
                fri.type,
                fri.scheme_id,
                ps.price_per_sapling 
             FROM users_farmerrequestitem fri
             JOIN productioncenter_stockdetails ps ON fri.stock_id = ps.id
             WHERE fri.request_id = ? AND fri.approved_quantity > 0`,
      [request_id]
    );

    console.log("Approved Items with Price:", approvedItems);

    // ✅ 4. Update stock for each item (logic unchanged)
    for (const item of approvedItems) {
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
        console.log("No cache keys found");
      }
    } catch (cacheErr) {
      console.error("Cache clearing error:", cacheErr);
    }

    // SEND BILL LINK SMS (unchanged)
    try {
      const [orderData] = await db.query(
        `SELECT orderid, farmer_id FROM users_farmerrequest WHERE id = ?`,
        [request_id]
      );

      if (orderData.length > 0) {
        const { orderid, farmer_id } = orderData[0];

        const [userRows] = await db.query(
          `SELECT phone, username FROM users_customuser WHERE id = ?`,
          [farmer_id]
        );

        if (userRows.length > 0 && userRows[0].phone) {
          const farmerPhone = userRows[0].phone;
          const farmerName = userRows[0].username;

          sendBillLinkSms(farmerPhone, orderid, farmerName)
            .then(() => console.log("✅ Bill SMS sent to:", farmerPhone))
            .catch((smsErr) => console.error("❌ Bill SMS failed:", smsErr.message));
        } else {
          console.log("⚠️ Farmer phone not found for user_id:", farmer_id);
        }
      }
    } catch (smsErr) {
      console.error("Bill SMS error (non-blocking):", smsErr.message);
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
// get dashboard counts
exports.getDashboardCounts = async (req, res) => {
  try {
    const user = req.user || {};
    const role = user.role;

    const department_id = req.query.department_id || user.department_id;
    const district_id = req.query.district_id || user.district_id;
    const block_id = req.query.block_id || user.block_id;

    if (!role) {
      return res.status(400).json({
        success: false,
        error: "User role is required."
      });
    }

    // ---------------------------------------------------------
    // FILTER (SAFE - LIKE YOUR getOfficers STYLE)
    // ---------------------------------------------------------
    let whereClause = '';
    let params = [];

    if (role === 'department_admin') {
      whereClause = 'WHERE pc.department_id = ?';
      params.push(department_id);
    }

    if (role === 'district_admin') {
      whereClause = 'WHERE pc.district_id = ?';
      params.push(district_id);
    }

    if (role === 'block_admin') {
      whereClause = 'WHERE pc.block_id = ?';
      params.push(block_id);
    }

    // ---------------------------------------------------------
    // OFFICER COUNT (FROM officer_details)
    // ---------------------------------------------------------
    const getOfficerRoleCount = async (roleName) => {
      let query = `
        SELECT COUNT(DISTINCT od.id) as count
        FROM officer_details od
        JOIN users_role r ON od.role = r.id
      `;

      let qParams = [];

      if (role === 'department_admin') {
        query += ' WHERE od.Department = ? AND r.name = ?';
        qParams.push(department_id, roleName);
      } else if (role === 'district_admin') {
        query += ' WHERE od.district_id = ? AND r.name = ?';
        qParams.push(district_id, roleName);
      } else if (role === 'block_admin') {
        query += ' WHERE od.block_id = ? AND r.name = ?';
        qParams.push(block_id, roleName);
      } else {
        query += ' WHERE r.name = ?';
        qParams.push(roleName);
      }

      const [rows] = await db.query(query, qParams);
      return rows[0]?.count || 0;
    };

    // ---------------------------------------------------------
    // PRODUCTION CENTER COUNT
    // ---------------------------------------------------------
    const getProductionCenterCount = async () => {
      let query = `
        SELECT COUNT(*) as count
        FROM productioncenter_productioncenter pc
        ${whereClause}
      `;

      const [rows] = await db.query(query, params);
      return rows[0]?.count || 0;
    };

    // ---------------------------------------------------------
    // FARMER COUNT (FIXED — NO WRONG JOIN)
    // ---------------------------------------------------------
    const getFarmerCount = async () => {
      let query = `
        SELECT COUNT(*) as count
        FROM users_farmeraathardetails f
      `;

      let qParams = [];

      // ⚠️ IMPORTANT:
      // We DO NOT assume production_center_id exists anymore
      // Instead we safely try direct filtering OR user mapping

      if (role === 'department_admin') {
        query += ' WHERE f.department_id = ?';
        qParams.push(department_id);
      }

      if (role === 'district_admin') {
        query += ' WHERE f.district_id = ?';
        qParams.push(district_id);
      }

      if (role === 'block_admin') {
        query += ' WHERE f.block_id = ?';
        qParams.push(block_id);
      }

      const [rows] = await db.query(query, qParams);
      return rows[0]?.count || 0;
    };

    // ---------------------------------------------------------
    // SPECIES COUNT (FIXED DISTINCT)
    // ---------------------------------------------------------
    const getSpeciesCount = async () => {
      let query = `
        SELECT COUNT(*) as count FROM (
          SELECT DISTINCT ps.species_id
          FROM productioncenter_stockdetails ps
          JOIN productioncenter_productioncenter pc 
            ON ps.production_center_id = pc.id
          ${whereClause}
        ) t
      `;

      const [rows] = await db.query(query, params);
      return rows[0]?.count || 0;
    };

    // ---------------------------------------------------------
    // FINAL RESPONSE (OLD STRUCTURE RESTORED)
    // ---------------------------------------------------------
    let data = {};

    if (role === 'superadmin') {
      data.department_admin_count = await getOfficerRoleCount('department_admin');
      data.district_admin_count = await getOfficerRoleCount('district_admin');
      data.block_admin_count = await getOfficerRoleCount('block_admin');

      data.production_centers_count = await getProductionCenterCount();
      data.farmers_count = await getFarmerCount();
      data.species_in_stock_count = await getSpeciesCount();
    }

    else if (role === 'department_admin') {
      data.district_admin_count = await getOfficerRoleCount('district_admin');
      data.block_admin_count = await getOfficerRoleCount('block_admin');

      data.production_centers_count = await getProductionCenterCount();
      data.farmers_count = await getFarmerCount();
      data.species_in_stock_count = await getSpeciesCount();
    }

    else if (role === 'district_admin') {
      data.block_admin_count = await getOfficerRoleCount('block_admin');

      data.production_centers_count = await getProductionCenterCount();
      data.farmers_count = await getFarmerCount();
      data.species_in_stock_count = await getSpeciesCount();
    }

    else if (role === 'block_admin') {
      data.production_centers_count = await getProductionCenterCount();
      data.farmers_count = await getFarmerCount();
      data.species_in_stock_count = await getSpeciesCount();
    }

    return res.status(200).json({
      success: true,
      data
    });

  } catch (err) {
    console.error("❌ Dashboard Error:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard counts",
      details: err.message
    });
  }
};
// 
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

// exports.getProductionCentersList = async (req, res) => {
//     try {
//         console.log("🚀 --- PRODUCTION CENTERS LIST API ---");

//         // 1. Get user info for filtering
//         const { role, district_id, block_id } = req.user;
//         console.log("🔐 User Role:", role);

//         // 2. Construct Query
//         // We select center details and SUM the saplings_available from the stock table.
//         // LEFT JOIN ensures we show centers even if they have 0 stock.
//         let query = `
//   SELECT 
//     pc.id,
//     pc.name_of_production_centre,
//     pc.complete_address,
//     pc.status,
//     pc.district_id,
//     md.District_Name AS District_Name,
//     pc.production_type,
//     COALESCE(SUM(ps.saplings_available), 0) as total_stock_count
//   FROM productioncenter_productioncenter pc
//   LEFT JOIN productioncenter_stockdetails ps ON pc.id = ps.production_center_id
//   LEFT JOIN master_district md ON pc.district_id = md.id
// `;

//         const params = [];

//         // 3. Apply Role-Based Filters
//         // These columns exist in the 'productioncenter_productioncenter' table
//         if (role === 'district_admin' && district_id) {
//             query += ` WHERE pc.district_id = ?`;
//             params.push(district_id);
//         } else if (role === 'block_admin' && block_id) {
//             query += ` WHERE pc.block_id = ?`;
//             params.push(block_id);
//         }
//         // Note: Superadmin or Department Admin gets no filter (sees all)

//         // 4. Group By is required for the SUM() function to work per center
//         query += ` GROUP BY pc.id`;

//         console.log("📝 SQL:", query);
//         console.log("📦 Params:", params);

//         // 5. Execute
//         const [rows] = await db.query(query, params);

//         console.log(`✅ Found ${rows.length} production centers.`);

//         res.status(200).json({
//             success: true,
//             data: rows
//         });

//     } catch (err) {
//         console.error("❌ Production Centers List Error:", err);
//         res.status(500).json({ 
//             success: false, 
//             error: "Failed to fetch production centers",
//             details: err.message 
//         });
//     }
// };
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
              pc.latitude, -- Added latitude
              pc.longitude, -- Added longitude
              COALESCE(SUM(ps.saplings_available), 0) as total_stock_count
          FROM productioncenter_productioncenter pc
          LEFT JOIN productioncenter_stockdetails ps ON pc.id = ps.production_center_id
          LEFT JOIN master_district md ON pc.district_id = md.id
        `;

    const params = [];

    // 3. Apply Role-Based Filters
    // These columns exist in the 'productioncenter_productioncenter' table
    if (role === 'district_admin' && district_id) {
      query += ` WHERE pc.district_id =?`;
      params.push(district_id);
    } else if (role === 'block_admin' && block_id) {
      query += ` WHERE pc.block_id =?`;
      params.push(block_id);
    }
    // Note: Superadmin or Department Admin gets no filter (sees all)

    // 4. Group By is required for the SUM() function to work per center
    query += ` GROUP BY pc.id, pc.latitude, pc.longitude`; // Added latitude and longitude to GROUP BY

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
                    td.financial_year,
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
        ps.sapling_age,
        ps.total_selled
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


exports.createProductionCenter = async (req, res) => {
  try {
    const { name, mobile, email } = req.body;

    // 1. Basic Validation
    if (!name || !mobile || !email) {
      return res.status(400).json({ error: "All fields are required." });
    }


    const insertQuery = `
      INSERT INTO users_customuser 
      (username, phone, email, role_id, date_joined) 
      VALUES (?, ?, ?, ?, NOW())
    `;

    await db.query(insertQuery, [
      name,
      mobile,
      email,
      2
    ]);

    res.status(201).json({
      message: "Registration successful! Please login with OTP."
    });

  } catch (err) {
    console.error("PC Registration Error:", err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'This mobile number or email is already registered.' });
    }

    res.status(500).json({ error: err.message });
  }
};


exports.generateBillPdf = async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: "order_id is required" });

    const [orderRows] = await db.query(`
      SELECT ur.*, pc.name_of_production_centre AS pc_name , dept.name AS department_name, pc.production_type, pc.complete_address AS pc_address
      FROM users_farmerrequest ur
      JOIN productioncenter_productioncenter pc ON ur.production_center_id = pc.id
      JOIN department dept ON pc.department_id = dept.id
      WHERE ur.orderid = ?
    `, [order_id]);

    if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = orderRows[0];

    const [farmerRows] = await db.query(`
      SELECT farmer_id, farmer_name AS farmer_name, mobile_number, address 
      FROM users_farmeraathardetails 
      WHERE user_id = ?
    `, [order.farmer_id]);
    const farmer = farmerRows[0] || {};

    // ✅ UPDATED: Fetch item details with type, scheme_name, schemed_rate, total_amount
    const [itemRows] = await db.query(`
  SELECT 
    fri.requested_quantity,
    fri.approved_quantity,
    fri.final_quantity,
    fri.type,
    fri.scheme_id,
    fri.schemed_rate,
    fri.total_amount,
    s.name AS species_name,
    ps.price_per_sapling   -- ✅ ACTUAL RATE SOURCE

  FROM users_farmerrequestitem fri

  JOIN tbl_agroforest_trees s 
    ON fri.species_id = s.id

  JOIN users_farmerrequest ur 
    ON fri.request_id = ur.id

  JOIN productioncenter_stockdetails ps 
    ON ps.production_center_id = ur.production_center_id
    AND ps.species_id = fri.species_id   -- ✅ VERY IMPORTANT

  WHERE fri.request_id = ?
`, [order.id]);

    // --- PDF SETUP --- (keeping all your existing PDF styling code)
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Bill_${order.orderid || order_id}.pdf`);
    doc.pipe(res);

    const pw = 595.28, ph = 841.89;
    const m = 20; const c = 45; const cw = pw - c * 2;

    // Background & Border (unchanged)
    doc.rect(0, 0, pw, ph).fill('#f9fbf9');
    doc.rect(m, m, pw - m * 2, ph - m * 2).strokeColor('#2e7d32').lineWidth(1.5).stroke();

    // Watermark Logo (unchanged)
    if (order.production_type === 'government') {
      const paths = [
        path.join(__dirname, '../public/TN.png'),
        path.join(__dirname, '../../public/TN.png'),
        path.join(process.cwd(), 'public/TN.png')
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) {
          doc.save().opacity(0.15)
            .image(p, (pw - 220) / 2, (ph - 220) / 2, { width: 220, height: 220 })
            .restore();
          break;
        }
      }
    }

    let y = c;

if (order.production_type === 'government') {
    const logoPaths = [
  path.join(__dirname, '../public/TN.png'),
  path.join(__dirname, '../../public/TN.png'),
  path.join(process.cwd(), 'public/TN.png')
];

for (const p of logoPaths) {
  if (fs.existsSync(p)) {
    const logoWidth = 60;
    const x = (pw - logoWidth) / 2;

    doc.image(p, x, y, { width: logoWidth });
    y += logoWidth + 10; // move content below logo

    break;
  }
}
}

    // --- Header (unchanged) ---
    // doc.moveTo(c, y).lineTo(c + cw, y).strokeColor('#2e7d32').lineWidth(2).stroke();
    // y += 15;
    doc.fillColor('#000000').fontSize(18).font('Helvetica-Bold')
      .text(order.pc_name || "Production Center", c, y, { width: cw, align: 'center' });
    y = doc.y + 4;
    doc.fillColor('#555').fontSize(9).font('Helvetica')
      .text(order.department_name || "", c, y, { width: cw, align: 'center' });
    y = doc.y + 7;
    doc.fillColor('#555').fontSize(9).font('Helvetica')
      .text(order.pc_address || "", c, y, { width: cw, align: 'center' });
    y = doc.y + 10;
    doc.fillColor('#1b5e20').fontSize(11).font('Helvetica-Bold')
      .text("INVOICE / BILL", c, y, { width: cw, align: 'center' });
    y = doc.y + 5;
    doc.moveTo(c, y).lineTo(c + cw, y).strokeColor('#2e7d32').lineWidth(2).stroke();
    y += 15;

    // --- Two Column Details (REMOVED scheme/type from Order Details) ---
    const halfW = (cw - 15) / 2;
    const lx = c, rx = c + halfW + 15;

    // Farmer Details
    doc.fillColor('#2e7d32').fontSize(10).font('Helvetica-Bold').text("Farmer Details", lx, y);
    y += 14;
    doc.fillColor('#333').fontSize(9).font('Helvetica');
    doc.text(`Name: ${farmer.farmer_name || 'N/A'}`, lx, y);
    doc.text(`Mobile: ${farmer.mobile_number || 'N/A'}`, lx, doc.y + 2);
    doc.text(`Address: ${farmer.address || 'N/A'}`, lx, doc.y + 2);
    const farmerEndY = doc.y;

    // Order Details (REMOVED scheme/type)
    doc.fillColor('#2e7d32').fontSize(10).font('Helvetica-Bold').text("Order Details", rx, y - 14);
    doc.fillColor('#333').fontSize(9).font('Helvetica');
    doc.text(`Order ID: ${order.orderid || order_id}`, rx, y);
    doc.text(`Date: ${new Date(order.created_at).toLocaleDateString('en-IN')}`, rx, doc.y + 2);
    doc.text(`Payment: ${(order.payment_type || 'N/A').toUpperCase()}`, rx, doc.y + 2);
    const orderEndY = doc.y;

    y = Math.max(farmerEndY, orderEndY) + 15;

    // --- UPDATED Table Headers ---
    const headers = ['S.No', 'Species', 'Type', 'Scheme Name', 'Qty', 'Scheme Rate', 'Actual Rate', 'Amount'];
    const colW = [35, 100, 45, 90, 45, 65, 65, 80];
    const rh = 22, hh = 24;

    // Header Row
    doc.rect(c, y, cw, hh).fill('#2e7d32');
    let tx = c;
    headers.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(7.5).font('Helvetica-Bold')
        .text(h, tx + 3, y + 6, { width: colW[i] - 6, align: 'center' });
      tx += colW[i];
    });
    y += hh;

    // Data Rows (PER ITEM scheme/type details)
    let grandTotal = 0;
    itemRows.forEach((item, idx) => {
      doc.rect(c, y, cw, rh).fill(idx % 2 === 0 ? '#fff' : '#f5f5f5');
      doc.moveTo(c, y + rh).lineTo(c + cw, y + rh).strokeColor('#ddd').lineWidth(0.5).stroke();

      const schemeRate = parseFloat(item.schemed_rate) || 0;
      const actualRate = parseFloat(item.price_per_sapling) || 0;
      const qty = item.final_quantity || item.approved_quantity || 0;
      const amount = schemeRate * qty;  // Use actual_rate * qty
      grandTotal += amount;

      const row = [
        String(idx + 1),
        item.species_name || '-',
        item.type?.toUpperCase() || '-',
        item.scheme_id ? `SCH-${item.scheme_id}` : '-',  // Show scheme ID or dash
        String(qty),
        `${schemeRate.toFixed(2)}`,
        `${actualRate.toFixed(2)}`,
        `${amount.toFixed(2)}`
      ];

      tx = c;
      row.forEach((cell, i) => {
        const align = i === 1 ? 'left' : 'center';  // Species left-aligned
        doc.fillColor('#333').fontSize(7.5).font('Helvetica')
          .text(cell, tx + 3, y + 4, { width: colW[i] - 6, align });
        tx += colW[i];
      });
      y += rh;
    });

    doc.moveTo(c, y).lineTo(c + cw, y).strokeColor('#2e7d32').lineWidth(1).stroke();
    y += 15;

    // --- Totals (simplified - no order-level discount calc) ---
    const txStart = c + cw - 200;
    const lblW = 120, valW = 70;

    doc.fillColor('#333').fontSize(9).font('Helvetica')
      .text("Grand Total:", txStart, y, { width: lblW, align: 'right' });
    doc.fillColor('#1b5e20').fontSize(11).font('Helvetica-Bold')
      .text(`${grandTotal.toFixed(2)}`, txStart + lblW, y, { width: valW, align: 'right' });
    y += 30;

    doc.end();

  } catch (err) {
    console.error("PDF Generation Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PDF", details: err.message });
    } else {
      res.end();
    }
  }
};