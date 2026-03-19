// routes/users.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all users
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users_customuser');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users_customuser WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;