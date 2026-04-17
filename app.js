const express = require('express');
const cors = require('cors');
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3001;

// ✅ SSL CERT PATHS (IMPORTANT: keep double backslashes OR use /)
const sslOptions = {
  key: fs.readFileSync("C:\\Users\\DEV2\\Music\\Agroforest\\Agroforest_Node_BD\\test.acsass.com.key"),
  cert: fs.readFileSync("C:\\Users\\DEV2\\Music\\Agroforest\\Agroforest_Node_BD\\test.acsass.com.crt"),
};

// const sslOptions = {
//   key: fs.readFileSync("C:\\Users\\DEV2\\Music\\Agroforest\\Agroforest_Node_BD\\test.acsass.com.key"),
//   cert: fs.readFileSync("C:\\Users\\DEV2\\Music\\Agroforest\\Agroforest_Node_BD\\test.acsass.com.crt"),
// };

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

app.get('/', (req, res) => {
  res.send('Hello, Express over HTTPS 🚀');
});

// ✅ Routes
const userRoutes = require('./routes/users');
const centerRoutes = require('./routes/centers');
const officerRoutes = require('./routes/officers');
const targetRoutes = require("./routes/target");
const reportRoutes = require("./routes/report");
const targetDepartmentRoutes = require('./routes/targetdepartment');
const targetDistrictRoutes = require('./routes/targetdistrict');
const targetBlockRoutes = require('./routes/targetblock');
const targetProductionCenterRoutes = require('./routes/targetproductioncenter');
const dynamicControl = require("./routes/dynamiccontrol")
const masterRoutes = require("./routes/master");
const former = require("./routes/former");

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
app.use('/former',former)
app.use("/dynamic",dynamicControl)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// ✅ START HTTPS SERVER (instead of app.listen)
https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTPS running at https://192.168.1.203:${PORT}`);
});