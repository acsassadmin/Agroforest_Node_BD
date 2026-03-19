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
        
        // Hash password (Django does this automatically)
        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            'INSERT INTO users_customuser (username, password, email) VALUES (?, ?, ?)', 
            [username, hashedPassword, email]
        );
        
        res.status(201).json({ message: 'User registered', userId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Verify OTP (Equivalent to VerifyOtpView)
exports.verifyOtp = async (req, res) => {
    try {
        const { user_id, otp } = req.body;
        // Logic to check OTP in your database
        // Assuming you have an 'otp' column or table
        const [rows] = await db.query('SELECT * FROM users_customuser WHERE id = ? AND otp = ?', [user_id, otp]);
        
        if (rows.length > 0) {
            // Mark user as verified
            await db.query('UPDATE users_customuser SET is_active = 1 WHERE id = ?', [user_id]);
            res.json({ message: 'OTP Verified' });
        } else {
            res.status(400).json({ message: 'Invalid OTP' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Login (Equivalent to CustomTokenObtainPairView)
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const [rows] = await db.query('SELECT * FROM users_customuser WHERE username = ?', [username]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = rows[0];

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
        const [rows] = await db.query('SELECT * FROM roles'); // Adjust table name
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