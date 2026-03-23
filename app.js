// app.js
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3001;

app.use(cors()); 
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, Express!');
});

const userRoutes = require('./routes/users');
const centerRoutes = require('./routes/centers');
const officerRoutes = require('./routes/officers');
const targetRoutes = require("./routes/target");
const reportRoutes = require("./routes/report");
const masterRoutes = require("./routes/master");




app.use('/users', userRoutes);
app.use('/center', centerRoutes);
app.use('/officers', officerRoutes);
app.use('/target', targetRoutes);
app.use('/report', reportRoutes);
app.use('/master', masterRoutes);




// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://192.168.1.126:${PORT}`);
});