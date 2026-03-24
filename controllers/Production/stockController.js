const db = require('../../db');
const redisClient = require('../../redisClient');
const ExcelJS = require('exceljs');

// --- HELPER: Clear Cache ---
const clearStockCache = async () => {
    const keys = await redisClient.keys('*stock_details_*');
    if (keys.length > 0) await redisClient.del(keys);
    
    const targetKeys = await redisClient.keys('*targets_*');
    if (targetKeys.length > 0) await redisClient.del(targetKeys);
};

// --- STOCK DETAILS LOGIC ---

// Helper to format response (mimics StockDetailsBulkSerializer)
const formatStockResponse = (rows) => {
    return rows.map(row => ({
        ...row,
        production_center_address: row.pc_address,
        production_center_name: row.pc_name
    }));
};

exports.getStockDetails = async (req, res) => {
    try {
        const { production_center_id, species_id, species_name, page = 1, latitude, longitude } = req.query;

        // 1. Cache Key
        const cacheKey = `stock_details_${production_center_id || 'all'}_${species_id || 'sim'}_${species_name || 'sna'}_page${page}_lat${latitude || 'x'}_lng${longitude || 'x'}`;
        //  await redisClient.del(cacheKey); 
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) return res.json(JSON.parse(cachedData));

        let whereClauses = [];
        let params = [];

        // 2. GeoLocation Logic
        if (latitude && longitude) {
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);

            const [centers] = await db.query(`
                SELECT id, (
                    6371 * acos(
                        cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) +
                        sin(radians(?)) * sin(radians(latitude))
                    )
                ) AS distance 
                FROM productioncenter_productioncenter 
                ORDER BY distance ASC
            `, [lat, lng, lat]);

            if (centers.length > 0) {
                const nearest = centers[0]; 
                whereClauses.push('sd.production_center_id = ?');
                params.push(nearest.id);
            }
        } 
        // 3. Standard Filters
        else if (production_center_id) {
            whereClauses.push('sd.production_center_id = ?');
            params.push(production_center_id);
        }

        if (production_center_id && species_id) {
             whereClauses.length = 0; 
             params.length = 0;
             whereClauses.push('sd.production_center_id = ? AND sd.id = ?');
             params.push(production_center_id, species_id);
        }

        // Search by species name from the trees table
        if (species_name) {
            whereClauses.push('trees.name LIKE ?');
            params.push(`%${species_name}%`);
        }

        // 4. Pagination Logic
        const limit = 10;
        const offset = (parseInt(page) - 1) * limit;
        
        // Count Query
        const [countRows] = await db.query(`
            SELECT COUNT(*) as count 
            FROM productioncenter_stockdetails sd
            LEFT JOIN tbl_agroforest_trees trees ON sd.species_id = trees.id
            ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
        `, params);
        const totalItems = countRows[0].count;

        // Data Query
        const [rows] = await db.query(`
            SELECT 
                sd.*, 
                pc.complete_address as pc_address, 
                pc.name_of_production_centre as pc_name,
                trees.name as species_name,
                trees.s_name as scientific_name,
                trees.name_tamil as species_name_tamil
            FROM productioncenter_stockdetails sd
            LEFT JOIN productioncenter_productioncenter pc ON sd.production_center_id = pc.id
            LEFT JOIN tbl_agroforest_trees trees ON sd.species_id = trees.id
            ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
            ORDER BY sd.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        // ✅ FIX: Manually map to ensure new fields are included in response
        // If you have a formatStockResponse function, you must update it to include these fields.
        // Replacing it with inline mapping here to guarantee it works:
        const formatted = rows.map(row => ({
            ...row,
            production_center_address: row.pc_address,
            production_center_name: row.pc_name,
            // Ensure these fields exist even if null
            species_name: row.species_name || null,
            scientific_name: row.scientific_name || null,
            species_name_tamil: row.species_name_tamil || null
        }));

        const responseData = {
            count: totalItems,
            next: totalItems > (offset + limit) ? `?page=${parseInt(page) + 1}` : null,
            previous: parseInt(page) > 1 ? `?page=${parseInt(page) - 1}` : null,
            results: formatted
        };

        await redisClient.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });
        res.json(responseData);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createStockDetail = async (req, res) => {
    try {
        const data = Array.isArray(req.body) ? req.body : [req.body];
        const userId = req.user?.id || 1;

        const insertedIds = [];

        for (const item of data) {

            const now = new Date();

            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');

            // ✅ Dates
            const productionDate = item.production_date
                ? new Date(item.production_date)
                : now;

            const expiryDate = item.expiry_date ? new Date(item.expiry_date) : null;

            // ❌ REMOVED: sapling_age calculation completely
            // ✅ NOW COMES FROM FRONTEND
            const saplingAge = item.sapling_age || "";

            // ✅ Lot number logic (unchanged)
            const [rows] = await db.query(
                `SELECT lot_number 
                 FROM productioncenter_stockdetails 
                 WHERE lot_number LIKE ? 
                 ORDER BY id DESC LIMIT 1`,
                [`L%-%-${year}`]
            );

            let nextNumber = 1;

            if (rows.length > 0) {
                const lastLot = rows[0].lot_number;
                const lastSeq = parseInt(lastLot.substring(1, 4));
                nextNumber = lastSeq + 1;
            }

            const sequence = String(nextNumber).padStart(3, '0');
            const lotNumber = `L${sequence}-${month}-${year}`;

            // ✅ INSERT
            const [result] = await db.query(
                `INSERT INTO productioncenter_stockdetails 
                (production_center_id, species_id, saplings_available, allocated_quantity, sapling_age, price_per_sapling, created_by_id, lot_number, production_date, expiry_date, \`current_date\`, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    item.production_center,
                    item.species_id,
                    item.saplings_available,
                    item.allocated_quantity || 0,
                    saplingAge, // ✅ FROM FRONTEND
                    item.price_per_sapling,
                    userId,
                    lotNumber,
                    productionDate,
                    expiryDate,
                    now
                ]
            );

            insertedIds.push({
                id: result.insertId,
                lot_number: lotNumber,
                sapling_age: saplingAge
            });
        }

        await clearStockCache();

        res.status(201).json({
            message: "Created successfully",
            data: insertedIds
        });

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.updateStockDetail = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        const fields = [];
        const values = [];
        const allowed = ['species_name', 'saplings_available', 'allocated_quantity', 'sapling_age', 'price_per_sapling'];

        allowed.forEach(f => {
            if (req.body[f] !== undefined) {
                fields.push(`${f} = ?`);
                values.push(req.body[f]);
            }
        });

        if (fields.length > 0) {
            values.push(id);
            await db.query(`UPDATE productioncenter_stockdetails SET ${fields.join(', ')} WHERE id = ?`, values);
        }

        await clearStockCache();
        
        // Fetch updated
        const [rows] = await db.query('SELECT * FROM productioncenter_stockdetails WHERE id = ?', [id]);
        res.json(rows[0]);

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.deleteStockDetail = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        await db.query('DELETE FROM productioncenter_stockdetails WHERE id = ?', [id]);
        await clearStockCache();
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- TARGET LOGIC ---

exports.getTargets = async (req, res) => {
    try {
        const { target_type, page = 1 } = req.query;
        const cacheKey = `targets_${target_type || 'all'}_page${page}`;
        
        const cached = await redisClient.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        let query = 'SELECT * FROM productioncenter_target';
        const params = [];
        if (target_type) {
            query += ' WHERE target_type = ?';
            params.push(target_type);
        }

        // Pagination
        const limit = 10;
        const offset = (parseInt(page) - 1) * limit;
        
        const [countRows] = await db.query(`SELECT COUNT(*) as count FROM productioncenter_target ${target_type ? 'WHERE target_type = ?' : ''}`, params);
        const [rows] = await db.query(`${query} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

        const response = {
            count: countRows[0].count,
            results: rows
        };

        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 3600 });
        res.json(response);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createTarget = async (req, res) => {
    try {
        const { target_type, target_value } = req.body;
        const [result] = await db.query(
            'INSERT INTO productioncenter_target (target_type, target_value, created_by) VALUES (?, ?, ?)',
            [target_type, target_value, req.user?.id || 1]
        );
        await clearStockCache();
        res.status(201).json({ id: result.insertId, target_type, target_value });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.updateTarget = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id required" });

        const { target_type, target_value } = req.body;
        await db.query(
            'UPDATE productioncenter_target SET target_type = ?, target_value = ? WHERE id = ?',
            [target_type, target_value, id]
        );
        
        await clearStockCache();
        const [rows] = await db.query('SELECT * FROM productioncenter_target WHERE id = ?', [id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.deleteTarget = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id required" });
        await db.query('DELETE FROM productioncenter_target WHERE id = ?', [id]);
        await clearStockCache();
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// --- STOCK REQUEST LOGIC ---

exports.getStockRequests = async (req, res) => {
    try {
        // Check if user is staff/admin (You need to add 'is_staff' to your JWT payload or check DB)
        // Assuming req.user.is_staff is available from middleware
        let query = `
            SELECT sr.*, u.username as user_name 
            FROM productioncenter_stockrequest sr
            JOIN users_customuser u ON sr.user_id = u.id
        `;
        
        // If not staff, filter by user
        if (!req.user?.is_staff) {
            query += ' WHERE sr.user_id = ?';
            const [rows] = await db.query(query, [req.user.id]);
            return res.json(rows);
        }

        query += ' ORDER BY sr.created_at DESC';
        const [rows] = await db.query(query);
        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createStockRequest = async (req, res) => {
    try {
        const { stock_detail, requested_quantity } = req.body;
        const [result] = await db.query(
            'INSERT INTO productioncenter_stockrequest (user_id, stock_detail_id, requested_quantity, status) VALUES (?, ?, ?, "pending")',
            [req.user.id, stock_detail, requested_quantity]
        );
        res.status(201).json({ id: result.insertId, message: "Request created" });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.handleStockRequest = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { request_id, action, requested_quantity } = req.body;

        await connection.beginTransaction();

        // 1. Get Request
        const [reqRows] = await connection.query('SELECT * FROM productioncenter_stockrequest WHERE id = ?', [request_id]);
        if (reqRows.length === 0) return res.status(404).json({ error: "Request not found" });
        const stockReq = reqRows[0];

        // 2. Update quantity if provided
        let finalQty = stockReq.requested_quantity;
        if (requested_quantity) {
            finalQty = requested_quantity;
            await connection.query('UPDATE productioncenter_stockrequest SET requested_quantity = ? WHERE id = ?', [finalQty, request_id]);
        }

        // 3. Approve/Reject Logic
        if (action === 'approve') {
            // Check Stock
            const [stockRows] = await connection.query('SELECT saplings_available FROM productioncenter_stockdetails WHERE id = ?', [stockReq.stock_detail_id]);
            if (stockRows.length === 0) throw new Error("Stock item not found");
            
            if (stockRows[0].saplings_available < finalQty) {
                throw new Error("Not enough saplings available");
            }

            // Deduct Stock
            await connection.query('UPDATE productioncenter_stockdetails SET saplings_available = saplings_available - ? WHERE id = ?', [finalQty, stockReq.stock_detail_id]);
            
            // Update Request Status
            await connection.query('UPDATE productioncenter_stockrequest SET status = "approved" WHERE id = ?', [request_id]);

        } else if (action === 'reject') {
            await connection.query('UPDATE productioncenter_stockrequest SET status = "rejected" WHERE id = ?', [request_id]);
        } else {
            throw new Error("Invalid action");
        }

        await connection.commit();
        res.json({ message: `Request ${action}ed` });

    } catch (err) {
        await connection.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
    }
};


// --- EXCEL REPORT ---
exports.downloadExcel = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Production Centers Report');

        // 1. Get Centers (Sorted by District)
        const [centers] = await db.query('SELECT * FROM productioncenter_productioncenter ORDER BY district');

        // 2. Get all Species names for headers
        const [speciesRows] = await db.query('SELECT DISTINCT species_name FROM productioncenter_stockdetails');
        const allSpecies = speciesRows.map(r => r.species_name);

        // 3. Headers
        worksheet.columns = [
            { header: 'S.No', key: 'sno', width: 10 },
            { header: 'District', key: 'district', width: 20 },
            { header: 'Name of Organization', key: 'name', width: 30 },
            { header: 'Nursery Capacity', key: 'capacity', width: 15 },
            { header: 'Organization Type', key: 'type', width: 20 },
            ...allSpecies.map(s => ({ header: s, key: s, width: 15 })),
            { header: 'Total Saplings', key: 'total', width: 15 }
        ];

        // Make header row bold
        worksheet.getRow(1).font = { bold: true };

        // 4. Fill Data
        let sno = 1;
        for (const center of centers) {
            // Get stock for this center
            const [stocks] = await db.query('SELECT species_name, SUM(saplings_available) as total FROM productioncenter_stockdetails WHERE production_center_id = ? GROUP BY species_name', [center.id]);
            
            // Map stock to species columns
            const stockMap = {};
            let totalSaplings = 0;
            stocks.forEach(s => {
                stockMap[s.species_name] = s.total;
                totalSaplings += s.total;
            });

            const row = {
                sno: sno++,
                district: center.district,
                name: center.name_of_production_centre,
                capacity: center.nursery_capacity,
                type: center.production_center_type_name || '', // Might need join or separate query for type name
                ...stockMap,
                total: totalSaplings
            };
            worksheet.addRow(row);
        }

        // 5. Send File
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="production_center_report.xlsx"');

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// --- DASHBOARD SUMMARY ---
exports.getDashboardSummary = async (req, res) => {
    try {
        // Parallel Queries for speed
        const [pcCount] = db.query('SELECT COUNT(*) as count FROM productioncenter_productioncenter');
        const [dcCount] = db.query('SELECT COUNT(*) as count FROM productioncenter_distributioncenter');
        const [farmerCount] = db.query('SELECT COUNT(*) as count FROM users_farmeraathardetails'); // Adjust table name
        const [finalizedCount] = db.query('SELECT COUNT(*) as count FROM productioncenter_farmerrequestitem WHERE status = "finalized"'); // Adjust table name
        const [stockSum] = db.query('SELECT SUM(saplings_available) as available, SUM(allocated_quantity) as allocated FROM productioncenter_stockdetails');
        const [pcList] = db.query('SELECT name_of_production_centre, latitude, longitude, nursery_capacity FROM productioncenter_productioncenter');

        const results = await Promise.all([pcCount, dcCount, farmerCount, finalizedCount, stockSum, pcList]);

        res.json({
            summary: {
                total_production_centers: results[0][0].count,
                total_distribution_centers: results[1][0].count,
                total_farmers: results[2][0].count,
                total_finalized_requests: results[3][0].count,
                total_available_stock: results[4][0].available || 0,
                total_allocated_stock: results[4][0].allocated || 0
            },
            production_centers: results[5][0]
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSpecies = async (req, res) => {
  try {
    const query = `SELECT * FROM tbl_agroforest_trees`;
    
    const [rows] = await db.query(query);
    
    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching trees:", err);
    res.status(500).json({ error: err.message });
  }
};



// Helper to clear cache
const clearSchemaCache = async () => {
  // if (redisClient) await redisClient.del('tn_schema_list');
  console.log("Cache cleared for tn_schema");
};

// --- GET ALL & GET BY ID (Combined) ---
exports.getScheme = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. GET BY ID Logic
    if (id) {
      const [rows] = await db.query('SELECT * FROM tn_schema WHERE id = ?', [id]);

      if (rows.length === 0) {
        return res.status(404).json({ error: "Scheme not found" });
      }

      let scheme = rows[0];
      // Parse JSON string back to array if needed
      if (scheme.species_preferred && typeof scheme.species_preferred === 'string') {
        try { scheme.species_preferred = JSON.parse(scheme.species_preferred); } catch (e) {}
      }

      return res.json(scheme);
    }

    // 2. GET ALL Logic
    const [rows] = await db.query('SELECT * FROM tn_schema ORDER BY id DESC');
    
    // Optional: Parse species_preferred for all items
    const parsedRows = rows.map(row => {
      if (row.species_preferred && typeof row.species_preferred === 'string') {
        try { row.species_preferred = JSON.parse(row.species_preferred); } catch (e) {}
      }
      return row;
    });

    res.json({ results: parsedRows });

  } catch (err) {
    console.error("Get Scheme Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// --- CREATE NEW SCHEME ---
exports.createScheme = async (req, res) => {
  try {
    const { name, percentage, species_preferred } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Scheme name is required" });
    }

    const speciesJson = species_preferred ? JSON.stringify(species_preferred) : null;

    const [result] = await db.query(
      `INSERT INTO tn_schema (name, percentage, species_preferred) VALUES (?, ?, ?)`,
      [name, percentage || null, speciesJson]
    );

    await clearSchemaCache();

    res.status(201).json({
      id: result.insertId,
      name,
      percentage,
      species_preferred
    });
  } catch (err) {
    console.error("Create Scheme Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// --- UPDATE SCHEME ---
exports.updateScheme = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, percentage, species_preferred } = req.body;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (percentage !== undefined) {
      updates.push('percentage = ?');
      values.push(percentage);
    }
    if (species_preferred !== undefined) {
      updates.push('species_preferred = ?');
      values.push(JSON.stringify(species_preferred));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    values.push(id);

    const [result] = await db.query(
      `UPDATE tn_schema SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Scheme not found" });
    }

    await clearSchemaCache();

    res.json({ message: "Scheme updated successfully" });
  } catch (err) {
    console.error("Update Scheme Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// --- DELETE SCHEME ---
exports.deleteScheme = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query('DELETE FROM tn_schema WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Scheme not found" });
    }

    await clearSchemaCache();

    res.json({ message: "Scheme deleted successfully" });
  } catch (err) {
    console.error("Delete Scheme Error:", err);
    res.status(500).json({ error: err.message });
  }
};

