const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Get token after 'Bearer'

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // FIX: Use the exact same secret string used in the login controller
    const JWT_SECRET = 'django-insecure-o+nog!1vl&o&qxyg0pz7g!x(u)ym6u8ae5yfint_jm2g-6efo1';

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // This block triggers if secrets don't match or token expired
            return res.status(403).json({ message: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

module.exports = authenticateToken;