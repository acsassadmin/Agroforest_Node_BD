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
const targetDepartmentRoutes = require('./routes/targetdepartment');
const targetDistrictRoutes = require('./routes/targetdistrict');
const targetBlockRoutes = require('./routes/targetblock');
const targetProductionCenterRoutes = require('./routes/targetproductioncenter');




const masterRoutes = require("./routes/master");




app.use('/users', userRoutes);
app.use('/center', centerRoutes);
app.use('/officers', officerRoutes);
app.use('/target', targetRoutes);
app.use('/report', reportRoutes);
app.use('/targetdepartment', targetDepartmentRoutes);
app.use('/targetdistrict', targetDistrictRoutes);
app.use('/targetblock', targetBlockRoutes);
app.use('/targetproductioncenter', targetProductionCenterRoutes);


app.use('/master', masterRoutes);




// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://192.168.1.126:${PORT}`);
});