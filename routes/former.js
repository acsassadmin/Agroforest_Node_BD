const express = require('express');
const former = require('../controllers/Former/formerController');
const upload = require('../Multer/upload');
const router = express.Router();

router.post("/sapplings-submitseeds",upload.single("image"), former.uploadSapplings);

module.exports = router;

// exports.getFarmerOrders = async (req, res) => {
//   try {
//     const user_id = req.params.userid;
//     const role = req.params.role;
//     const page = parseInt(req.query.page) || 1;
//     const limit = 10;
//     const offset = (page - 1) * limit;

//     // 1️⃣ Get logged-in user
//     const [userRows] = await db.execute(
//       `SELECT district_id, block_id, department_id 
//        FROM users_customuser 
//        WHERE id = ?`,
//       [user_id]
//     );

//     if (!userRows.length) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const user = userRows[0];

//     // 2️⃣ Base SQL (common)
//     let baseSql = `
//       FROM users_farmerrequest ufr
//       LEFT JOIN farmer f ON f.farmer_id = ufr.farmer_id
//       LEFT JOIN master_district d ON d.id = f.district_id
//       LEFT JOIN master_block b ON b.id = f.block_id
//       LEFT JOIN master_village v ON v.id = f.village_id
//       LEFT JOIN tn_schema ts ON ts.id = ufr.scheme_id
//       LEFT JOIN productioncenter_productioncenter pc
//         ON pc.id = ufr.production_center_id
//       WHERE ufr.status = 'billed'
//         AND ufr.type = 'scheme'
//         AND ufr.payment_type = 'Free of Cost'
//     `;

//     let params = [];

//     // 3️⃣ Role filtering (ALL based on Production Center now)
//     if (role === "district_admin") {
//       // ✅ Match with PRODUCTION CENTER's district
//       baseSql += ` AND pc.district_id = ?`;
//       params.push(user.district_id);
//     } else if (role === "block_admin") {
//       // ✅ Match with PRODUCTION CENTER's block
//       baseSql += ` AND pc.block_id = ?`;
//       params.push(user.block_id);
//     } else if (role === "department_admin") {
//       // ✅ Match with PRODUCTION CENTER's department
//       baseSql += `
//         AND ufr.production_center_id IN (
//           SELECT id FROM productioncenter_productioncenter 
//           WHERE department_id = ?
//         )
//       `;
//       params.push(user.department_id);
//     }

//     // 4️⃣ Total count
//     const countSql = `SELECT COUNT(*) as total ${baseSql}`;
//     const [[countResult]] = await db.execute(countSql, params);
//     const totalRecords = countResult.total;
//     const totalPages = Math.ceil(totalRecords / limit);

//     // 5️⃣ Paginated orders
//     const dataSql = `
//       SELECT 
//         ufr.id AS request_id,
//         ufr.orderid,
//         ufr.farmer_id,
//         ufr.scheme_id,
//         ufr.created_at,

//         ts.name AS scheme_name,

//         f.farmer_name,
//         f.mobile_number,
//         f.address,

//         d.District_Name,
//         b.Block_Name,
//         v.village_name,

//         pc.id AS production_center_id,
//         pc.name_of_production_centre,
//         pc.complete_address,
//         pc.district_id AS pc_district_id,    -- ✅ Added this
//         pc.block_id AS pc_block_id,
//         pc.department_id AS pc_department_id

//       ${baseSql}
//       ORDER BY ufr.created_at DESC
//       LIMIT ? OFFSET ?
//     `;

//     const [orders] = await db.execute(dataSql, [...params, limit, offset]);

//     if (!orders.length) {
//       return res.json({
//         success: true,
//         total_records: totalRecords,
//         total_pages: totalPages,
//         current_page: page,
//         data: []
//       });
//     }

//     // 6️⃣ Items
//     const requestIds = orders.map(o => o.request_id);
//     const itemPlaceholders = requestIds.map(() => '?').join(',');

//     const [items] = await db.execute(
//       `
//       SELECT 
//         ufi.request_id,
//         ufi.stock_id,
//         ufi.final_quantity,
//         t.name AS species_name,
//         t.name_tamil AS species_name_tamil
//       FROM users_farmerrequestitem ufi
//       LEFT JOIN tbl_agroforest_trees t ON t.id = ufi.species_id
//       WHERE ufi.request_id IN (${itemPlaceholders})
//       `,
//       requestIds
//     );

//     const itemsMap = {};
//     items.forEach(i => {
//       if (!itemsMap[i.request_id]) itemsMap[i.request_id] = [];
//       itemsMap[i.request_id].push(i);
//     });

//     // 7️⃣ Block admins
//     const blockIds = [...new Set(orders.map(o => o.pc_block_id).filter(Boolean))];
//     let blockAdminMap = {};

//     if (blockIds.length) {
//       const placeholders = blockIds.map(() => '?').join(',');

//       const [admins] = await db.execute(
//         `SELECT id, block_id, first_name, last_name
//          FROM users_customuser
//          WHERE role_id = 6 AND block_id IN (${placeholders})`,
//         blockIds
//       );

//       admins.forEach(a => {
//         if (!blockAdminMap[a.block_id]) blockAdminMap[a.block_id] = [];
//         blockAdminMap[a.block_id].push({
//           id: a.id,
//           name: `${a.first_name} ${a.last_name || ''}`.trim()
//         });
//       });
//     }

//     // 8️⃣ Inspections + uploads + saplings
//     const orderIds = orders.map(o => o.orderid);
//     let inspectionMap = {};

//     if (orderIds.length) {
//       const placeholders = orderIds.map(() => '?').join(',');

//       const [inspections] = await db.execute(
//         `SELECT * FROM inspections WHERE order_id IN (${placeholders})`,
//         orderIds
//       );

//       if (inspections.length) {
//         const inspectionIds = inspections.map(i => i.id);
//         const uploadPlaceholders = inspectionIds.map(() => '?').join(',');

//         const [uploads] = await db.execute(
//           `SELECT * FROM inspection_uploads WHERE inspection_id IN (${uploadPlaceholders})`,
//           inspectionIds
//         );

//         let uploadMap = {};
//         let uploadIds = [];
//         let inspectorIds = new Set();
//         const baseUrl = `${req.protocol}://${req.get("host")}`;

//         uploads.forEach(u => {
//           uploadIds.push(u.id);
//           if (u.inspected_by) inspectorIds.add(u.inspected_by);

//           if (!uploadMap[u.inspection_id]) uploadMap[u.inspection_id] = [];

//           uploadMap[u.inspection_id].push({
//             id: u.id,
//             verification_status: u.verification_status,
//             image: u.image ? `${baseUrl}/uploads/${u.image}` : null,
//             created_at: u.created_at,
//             reason_for_reject:
//               u.verification_status === "rejected"
//                 ? u.reason_for_reject
//                 : null,
//             inspection_address: u.inspection_address,
//             latitude: u.latitude,
//             longitude: u.longitude,
//             survey_count: u.survey_count,
//             inspected_by: u.inspected_by,
//             inspected_by_name: null,
//             saplings: []
//           });
//         });

//         // inspector names
//         let inspectorMap = {};
//         if (inspectorIds.size) {
//           const ids = Array.from(inspectorIds);
//           const placeholders = ids.map(() => '?').join(',');

//           const [inspectors] = await db.execute(
//             `SELECT id, first_name, last_name FROM users_customuser WHERE id IN (${placeholders})`,
//             ids
//           );

//           inspectors.forEach(i => {
//             inspectorMap[i.id] = `${i.first_name} ${i.last_name || ''}`.trim();
//           });
//         }

//         // attach inspector names
//         Object.keys(uploadMap).forEach(insId => {
//           uploadMap[insId].forEach(u => {
//             u.inspected_by_name = inspectorMap[u.inspected_by] || null;
//           });
//         });

//         // saplings 
//         let saplingMap = {};
//         if (uploadIds.length) {
//           const placeholders = uploadIds.map(() => '?').join(',');

//           const [saplings] = await db.execute(
//             `SELECT * FROM inspection_sapplings WHERE upload_id IN (${placeholders})`,
//             uploadIds
//           );

//           saplings.forEach(s => {
//             if (!saplingMap[s.upload_id]) saplingMap[s.upload_id] = [];
//             saplingMap[s.upload_id].push({
//               id: s.id,
//               sapling_name: s.sappling_name,
//               survey_count: s.survey_count
//             });
//           });
//         }

//         // attach saplings
//         Object.keys(uploadMap).forEach(insId => {
//           uploadMap[insId].forEach(u => {
//             u.saplings = saplingMap[u.id] || [];
//           });
//         });

//         // group inspections
//         inspections.forEach(ins => {
//           if (!inspectionMap[ins.order_id]) inspectionMap[ins.order_id] = [];

//           inspectionMap[ins.order_id].push({
//             id: ins.id,
//             farmer_id: ins.farmer_id,
//             block_admin_id: ins.block_admin_id,
//             inspection_scheduled_date: ins.inspection_scheduled_date,
//             remarks: ins.remarks,
//             completed_inspection_session: ins.completed_inspection_session,
//             next_inspection_date: ins.next_inspection_date,
//             created_at: ins.created_at,
//             uploads: uploadMap[ins.id] || []
//           });
//         });
//       }
//     }

//     // 9️⃣ Final response
//     const result = orders.map(order => ({
//       order_id: order.orderid,
//       order_date: order.created_at,

//       scheme: {
//         id: order.scheme_id,
//         name: order.scheme_name
//       },

//       farmer: order.farmer_id
//         ? {
//             id: order.farmer_id,
//             name: order.farmer_name,
//             mobile: order.mobile_number,
//             address: order.address,
//             location: {
//               district: order.District_Name,
//               block: order.Block_Name,  
//               village: order.village_name
//             }
//           }
//         : null,

//       production_center: order.production_center_id
//         ? {
//             id: order.production_center_id,
//             name: order.name_of_production_centre,
//             address: order.complete_address,
//             district_id: order.pc_district_id,    // ✅ Added this
//             block_id: order.pc_block_id,
//             department_id: order.pc_department_id
//           }
//         : null,

//       block_admins: order.pc_block_id
//         ? blockAdminMap[order.pc_block_id] || []
//         : [],

//       inspections: inspectionMap[order.orderid] || [],
//       items: itemsMap[order.request_id] || []
//     }));

//     return res.json({
//       success: true,
//       total_records: totalRecords,
//       total_pages: totalPages,
//       current_page: page,
//       data: result
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server Error" });
//   }
// };
// // assign inspection
// exports.assignInspection = async (req, res) => {

//   try {
//     const {
//       orderid,
//       block_admin_id,
//       inspection_scheduled_date,
//       remarks
//     } = req.body;

//     console.log(orderid, block_admin_id, inspection_scheduled_date, remarks);

//     // 1️⃣ Basic validation
//     if (!orderid || !block_admin_id || !inspection_scheduled_date) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields"
//       });
//     }

//     // 2️⃣ Optional: Get farmer_id if exists
//     const [orderRows] = await db.execute(
//       `SELECT farmer_id FROM users_farmerrequest WHERE orderid = ?`,
//       [orderid]
//     );

//     const farmer_id = orderRows.length ? orderRows[0].farmer_id : null;

//     // 3️⃣ Insert into inspections table
//     const [result] = await db.execute(
//       `
//       INSERT INTO inspections
//       (order_id, farmer_id, block_admin_id, inspection_scheduled_date, remarks, completed_inspection_session)
//       VALUES (?, ?, ?, ?, ?, 0)
//       `,
//       [orderid, farmer_id, block_admin_id, inspection_scheduled_date, remarks || null]
//     );

//     // 4️⃣ Return success
//     return res.json({
//       success: true,
//       message: "Inspection assigned successfully",
//       inspection_id: result.insertId
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// };
// //  Approve inspection
// exports.approveInspection = async (req, res) => {
//     try {
//         const inspectionId = req.params.id; 
//         const { remarks } = req.body;

//         // 1. Get latest upload for this inspection
//         const [uploadResult] = await db.query(
//             `SELECT * FROM inspection_uploads 
//              WHERE inspection_id = ?
//              ORDER BY created_at DESC
//              LIMIT 1`,
//             [inspectionId]
//         );

//         if (uploadResult.length === 0) {
//             return res.status(404).json({ message: "Upload not found" });
//         }

//         const upload = uploadResult[0];

//         // 2. Approve upload
//         await db.query(
//             `UPDATE inspection_uploads 
//              SET verification_status = 'approved'
//              WHERE id = ?`,
//             [upload.id]
//         );

//         // 3. Get inspection
//         const [inspResult] = await db.query(
//             `SELECT * FROM inspections WHERE id = ?`,
//             [inspectionId]
//         );

//         if (inspResult.length === 0) {
//             return res.status(404).json({ message: "Inspection not found" });
//         }

//         const inspection = inspResult[0];

//         let currentSession = inspection.completed_inspection_session || 0;
//         let newSession = currentSession + 1;

//         let nextDate = null;
//         let message = "";

//         if (newSession < 3) {
//             let date = new Date();  
//             date.setMonth(date.getMonth() + 3);
//             nextDate = date.toISOString().split('T')[0];

//             message = `Session ${newSession} completed. Next inspection scheduled.`;
//         } else {
//             message = `All 3 sessions completed.`;
//         }

//         // 4. Update inspection (remarks + reminder)
//         await db.query(
//             `UPDATE inspections
//              SET remarks = ?,
//                  completed_inspection_session = ?,
//                  next_inspection_date = ?
//              WHERE id = ?`,
//             [remarks || null, newSession, nextDate, inspectionId]
//         );
        
//         return res.json({
//             message,
//             completed_session: newSession,
//             next_inspection_date: nextDate,
//             remarks: remarks || null
//         });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: "Server error" });
//     }
// };
// // reject inspection
// exports.rejectInspection = async (req, res) => {
//     try {
//         const inspectionId = req.params.id;
//         const { reason_for_reject } = req.body; 

//         const sql = `
//             UPDATE inspection_uploads
//             SET 
//                 verification_status = 'rejected',
//                 reason_for_reject = ?
//             WHERE id = ?
//         `;

//         const result = await db.query(sql, [
//             reason_for_reject || null,
//             inspectionId
//         ]);

//         if (result.affectedRows === 0) {    
//             return res.status(404).json({ message: "Upload not found" });
//         }

//         return res.json({ 
//             message: "Inspection rejected successfully",
//             reason_for_reject: reason_for_reject || null
//         });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: "Server error" });
//     }
// };
// // upload inspection
// exports.uploadInspectionDetails = async (req, res) => {
//     try {
//         const {
//             inspection_id,
//             inspection_address,
//             latitude,
//             longitude,
//             survey_count,
//             inspected_by,
//             sapplings
//         } = req.body;

//         if (!inspection_id) {
//             return res.status(400).json({ message: "Inspection ID is required" });
//         }

//         if (!req.file || !req.file.filename) {
//             return res.status(400).json({ message: "No file uploaded" });
//         }

//         const image = req.file.filename;

//         // Insert into main table
//         const sql = `
//             INSERT INTO inspection_uploads 
//             (inspection_id, image, inspection_address, latitude, longitude, survey_count, inspected_by)
//             VALUES (?, ?, ?, ?, ?, ?, ?)
//         `;

//         // insert into main table
//         const result = await db.query(sql, [
//             inspection_id,
//             image,
//             inspection_address,
//             latitude,
//             longitude,
//             survey_count,
//             inspected_by
//         ]);
   
      
//         const uploadId = result[0].insertId;
//        console.log("upload id",uploadId);
       
//         // Insert sapplings (if provided)
//         if (sapplings && Array.isArray(sapplings)) {
//             const sapplingValues = sapplings.map(item => [
//                 uploadId,
//                 item.sapplingname, 
//                 item.survey_count   
//             ]);

//             const sapplingSql = ` 
//                 INSERT INTO inspection_sapplings (upload_id, sappling_name, survey_count)
//                 VALUES ?
//             `;
//             await db.query(sapplingSql, [sapplingValues]);
//         }

//         return res.json({
//             message: "Upload successful",
//             uploadId: uploadId
//         });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: "Server error" });
//     }
// };
