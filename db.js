// db.js
const mysql = require('mysql2');

// Replace with your existing database credentials
const pool = mysql.createPool({
  host: 'localhost',       
  user: 'root',
  password: '',
  database: 'agroforest',
  waitForConnections: true,
    port: 3306, 
  connectionLimit: 10,
  queueLimit: 0
});

// Use promise-based queries
module.exports = pool.promise();