// db.js
const mysql = require('mysql2');

// Replace with your existing database credentials
const pool = mysql.createPool({
  host: 'localhost',       
  user: 'root',
  password: '12345',
  database: 'agroforest',
  waitForConnections: true,
    port: 330, 
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true
});

// Use promise-based queries
module.exports = pool.promise();