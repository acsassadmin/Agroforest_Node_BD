const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// SECRET KEY for JWT (In Django, this is in settings.py)
const JWT_SECRET = 'your_super_secret_key'; 
const JWT_REFRESH_SECRET = 'your_refresh_secret_key';

// 1. Register (Equivalent to RegisterView)
exports.register = async (req, res) => {
    try {
        const { username, password, email } = req.body;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        // Store temporarily (you can use Redis or DB)
        await db.query(
            'INSERT INTO temp_users (username, email, password, otp) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, otp]
        );

        res.json({ message: "OTP sent", otp }); // remove otp in production
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Verify OTP (Equivalent to VerifyOtpView)
exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const [rows] = await db.query(
            'SELECT * FROM temp_users WHERE email = ? AND otp = ?',
            [email, otp]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        const tempUser = rows[0];

        // Now create real user
        const [result] = await db.query(
            'INSERT INTO users_customuser (username, email, password) VALUES (?, ?, ?)',
            [tempUser.username, tempUser.email, tempUser.password]
        );

        // Delete temp data
        await db.query('DELETE FROM temp_users WHERE email = ?', [email]);

        res.status(201).json({ message: 'User registered successfully' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
// 3. Login (Equivalent to CustomTokenObtainPairView)
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(email , "username");
        console.log(password , "password");

        const [rows] = await db.query('SELECT * FROM users_customuser WHERE email = ?', [email]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = rows[0];
        console.log("Entered password:", password);
        console.log("DB hash:", user.password);
        // Check password (Django check_password)
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate Tokens (SimpleJWT logic)
        const accessToken = jwt.sign({ id: user.id, role: user.role_id }, JWT_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

        res.json({ access: accessToken, refresh: refreshToken });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Refresh Token (Equivalent to TokenRefreshView)
exports.refreshToken = (req, res) => {
    const { refresh } = req.body;
    if (!refresh) return res.sendStatus(401);

    jwt.verify(refresh, JWT_REFRESH_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        
        // Create new access token
        const accessToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '15m' });
        res.json({ access: accessToken });
    });
};

// 5. Farmer Request
exports.farmerRequest = async (req, res) => {
    try {
        // Assuming you verify user via middleware or just receiving data
        const { farmer_id, item_name } = req.body;
        const [result] = await db.query('INSERT INTO farmer_requests (farmer_id, item_name) VALUES (?, ?)', [farmer_id, item_name]);
        res.status(201).json({ message: 'Request created', id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. Approve Item
exports.approveItem = async (req, res) => {
    try {
        const { request_id } = req.body;
        await db.query('UPDATE farmer_requests SET status = ? WHERE id = ?', ['Approved', request_id]);
        res.json({ message: 'Item Approved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7. Roles
exports.getRoles = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM users_role'); // Adjust table name
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 8. Farmer Aadhar
exports.farmerAadhar = async (req, res) => {
    try {
        const { farmer_id, aadhar_number } = req.body;
        // Logic to save aadhar
        await db.query('UPDATE users_customuser SET aadhar_number = ? WHERE id = ?', [aadhar_number, farmer_id]);
        res.json({ message: 'Aadhar updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};