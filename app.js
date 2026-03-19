// app.js
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3001;

app.use(cors()); // Enable CORS for React
app.use(express.json());

// Define a simple route
app.get('/', (req, res) => {
  res.send('Hello, Express!');
});

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});