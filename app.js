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

const userRoutes = require('./routes/users');
const centerRoutes = require('./routes/centers');
const masterRoutes = require('./routes/master');

app.use('/users', userRoutes);
app.use('/center', centerRoutes);
app.use('/master', masterRoutes); 

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://192.168.1.42:${PORT}`);
});