const db = require('../../db'); 
const multer = require('multer');
const path = require('path');
const redisClient = require('../../redisClient'); 

// --- FILE UPLOAD CONFIGURATION ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/production_center_certificates/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });
exports.uploadMiddleware = upload.array('certificate_file', 10);

// --- HELPER: Clear Cache ---
// We need to clear cache whenever data changes (POST, PUT, DELETE)
const clearProductionCenterCache = async () => {
    // Note: Using .keys is okay for small apps. For large apps, use versioning or sets.
    const keys = await redisClient.keys('*production_center_*');
    if (keys.length > 0) await redisClient.del(keys);
    
    const typeKeys = await redisClient.keys('*prod_type_*');
    if (typeKeys.length > 0) await redisClient.del(typeKeys);
};

// --- PRODUCTION CENTER TYPES LOGIC ---

exports.getProductionCenterTypes = async (req, res) => {
    try {
        const { id, search, page = 1 } = req.query;
        
        // 1. Define Cache Key
        const cacheKey = `prod_type_${id || 'all'}_${search || 'na'}_page${page}`;

        // 2. Check Redis
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            return res.json(JSON.parse(cachedData));
        }

        // 3. Database Logic
        if (id) {
            const [rows] = await db.query('SELECT * FROM productioncenter_productioncentertypes WHERE id = ?', [id]);
            if (rows.length === 0) return res.status(404).json({ error: "Type not found" });
            
            await redisClient.set(cacheKey, JSON.stringify(rows[0]), { EX: 3600 });
            return res.json(rows[0]);
        }

        let query = 'SELECT * FROM productioncenter_productioncentertypes';
        const params = [];
        if (search) {
            query += ' WHERE name LIKE ?';
            params.push(`%${search}%`);
        }
        query += ' ORDER BY id DESC';

        const [rows] = await db.query(query, params);
        const responseData = { count: rows.length, results: rows };

        // 4. Set Redis
        await redisClient.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });
        res.json(responseData);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProductionCenterType = async (req, res) => {
    try {
        const { name } = req.body;
        const [result] = await db.query('INSERT INTO productioncenter_productioncentertypes (name) VALUES (?)', [name]);
        
        await clearProductionCenterCache(); // Clear Cache
        
        res.status(201).json({ id: result.insertId, name });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.updateProductionCenterType = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        const { name } = req.body;
        await db.query('UPDATE productioncenter_productioncentertypes SET name = ? WHERE id = ?', [name, id]);
        
        await clearProductionCenterCache(); // Clear Cache

        const [rows] = await db.query('SELECT * FROM productioncenter_productioncentertypes WHERE id = ?', [id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.deleteProductionCenterType = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });
        
        await db.query('DELETE FROM productioncenter_productioncentertypes WHERE id = ?', [id]);
        
        await clearProductionCenterCache(); // Clear Cache
        
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// --- HELPER FUNCTION FOR SERIALIZER STRUCTURE ---
const formatCenterData = (centers, certificates) => {
    return centers.map(center => {
        const centerCerts = certificates
            .filter(cert => cert.production_center_id === center.id)
            .map(cert => ({
                id: cert.id,
                certificate_file: cert.certificate_file
            }));
        return {
            ...center,
            certificates: centerCerts
        };
    });
};

// --- PRODUCTION CENTER LOGIC ---

exports.getProductionCenters = async (req, res) => {
    try {
        // 1. Get Filters & Pagination from Query or User Object
        const user = req.user || {};
        const query = req.query;

        const id = query.id;
        const search = query.search;
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
        const offset = (page - 1) * limit;

        // --- NEW FILTER PARAMS ---
        const production_type = query.production_type; // 'government' or 'private'
        const status = query.status; // 'approved', 'pending', 'rejected'

        // Helper to parse comma-separated IDs or arrays from query
        const parseArrayParam = (param) => {
            if (!param) return [];
            if (Array.isArray(param)) return param.map(Number).filter(n => !isNaN(n));
            return param.toString().split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        };

        const department_ids = parseArrayParam(query.department_ids);
        const district_ids = parseArrayParam(query.district_ids);
        const block_ids = parseArrayParam(query.block_ids);
        // -------------------------

        // Role & Scope Determination
        const role = query.role || user.role;
        const user_department_id = query.department_id || user.department_id;
        const user_district_id = query.district_id || user.district_id;
        const user_block_id = query.block_id || user.block_id;

        // ---------------------------------------------------------
        // 2. STRICT VALIDATION
        // ---------------------------------------------------------
        if (!role) {
            return res.status(400).json({ success: false, error: "User role is required." });
        }

        let scopeFilter = 'all';
        let scopeId = null;

        if (role === 'department_admin') {
            if (!user_department_id) return res.status(400).json({ success: false, error: "Department ID is required for Department Admin." });
            scopeFilter = 'department';
            scopeId = user_department_id;
        } else if (role === 'district_admin') {
            if (!user_district_id) return res.status(400).json({ success: false, error: "District ID is required for District Admin." });
            scopeFilter = 'district';
            scopeId = user_district_id;
        } else if (role === 'block_admin') {
            if (!user_block_id) return res.status(400).json({ success: false, error: "Block ID is required for Block Admin." });
            scopeFilter = 'block';
            scopeId = user_block_id;
        }

        // Common Joins
        const joins = `
            JOIN master_district d ON pc.district_id = d.id
            LEFT JOIN master_block b ON pc.block_id = b.id
            LEFT JOIN master_village v ON pc.village_id = v.id
            LEFT JOIN department dept ON pc.department_id = dept.id
        `;

        // ---------------------------------------------------------
        // 3. SINGLE ITEM LOGIC (No Pagination)
        // ---------------------------------------------------------
        if (id) {
            let singleQuery = `
                SELECT 
                    pc.*, 
                    d.District_Name as district_name,
                    b.Block_Name as block_name,
                    v.Village_Name as village_name,
                    dept.name as department_name
                FROM productioncenter_productioncenter pc
                ${joins}
                WHERE pc.id = ?
            `;
            const params = [id];

            // Apply Scope Check
            if (scopeFilter === 'department') {
                singleQuery += ' AND pc.department_id = ?';
                params.push(scopeId);
            } else if (scopeFilter === 'district') {
                singleQuery += ' AND pc.district_id = ?';
                params.push(scopeId);
            } else if (scopeFilter === 'block') {
                singleQuery += ' AND pc.block_id = ?';
                params.push(scopeId);
            }

            const [centers] = await db.query(singleQuery, params);

            if (centers.length === 0) {
                return res.status(404).json({ success: false, error: "Production Center not found or access denied" });
            }

            const [certs] = await db.query('SELECT id, certificate_file FROM productioncenter_productioncentercertificate WHERE production_center_id = ?', [id]);
            const formatted = formatCenterData(centers, certs);

            return res.json(formatted[0]);
        }

        // ---------------------------------------------------------
        // 4. LIST LOGIC (With Pagination & Filters)
        // ---------------------------------------------------------
        
        // A. Build Base Conditions
        let whereClauses = ["1=1"];
        let params = [];

        // Scope Filters (Existing Logic)
        if (scopeFilter === 'department') {
            whereClauses.push('pc.department_id = ?');
            params.push(scopeId);
        } else if (scopeFilter === 'district') {
            whereClauses.push('pc.district_id = ?');
            params.push(scopeId);
        } else if (scopeFilter === 'block') {
            whereClauses.push('pc.block_id = ?');
            params.push(scopeId);
        }

        
        
        // Existing Search Filter
        if (search) {
            whereClauses.push('(pc.name_of_production_centre LIKE ? OR pc.contact_person LIKE ? OR pc.mobile_number LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // --- NEW FILTER LOGIC START ---
        
        // Filter by Production Type (Government/Private)
        if (production_type) {
            whereClauses.push('pc.production_type = ?');
            params.push(production_type);
        }

        // Filter by Status
        if (status) {
            whereClauses.push('pc.status = ?');
            params.push(status);
        }

        // Filter by Multiple Departments
        if (department_ids.length > 0) {
            const placeholders = department_ids.map(() => '?').join(',');
            whereClauses.push(`pc.department_id IN (${placeholders})`);
            params.push(...department_ids);
        }

        // Filter by Multiple Districts
        if (district_ids.length > 0) {
            const placeholders = district_ids.map(() => '?').join(',');
            whereClauses.push(`pc.district_id IN (${placeholders})`);
            params.push(...district_ids);
        }

        // Filter by Multiple Blocks
        if (block_ids.length > 0) {
            const placeholders = block_ids.map(() => '?').join(',');
            whereClauses.push(`pc.block_id IN (${placeholders})`);
            params.push(...block_ids);
        }

        // --- NEW FILTER LOGIC END ---

        const whereString = whereClauses.join(' AND ');

        // B. Get Total Count
        const countQuery = `SELECT COUNT(*) as total FROM productioncenter_productioncenter pc ${joins} WHERE ${whereString}`;
        const [countRows] = await db.query(countQuery, params);
        const totalCount = countRows[0].total;

        // C. Get Paginated Data
        const dataQuery = `
            SELECT 
                pc.*, 
                d.District_Name as district_name,
                b.Block_Name as block_name,
                v.Village_Name as village_name,
                dept.name as department_name
            FROM productioncenter_productioncenter pc
            ${joins}
            WHERE ${whereString}
            ORDER BY pc.id DESC
            LIMIT ? OFFSET ?
        `;
        
        const dataParams = [...params, limit, offset];

        const [centers] = await db.query(dataQuery, dataParams);
        
        // D. Fetch Certificates
        const centerIds = centers.map(c => c.id);
        let certs = [];
        if (centerIds.length > 0) {
            [certs] = await db.query(`SELECT id, production_center_id, certificate_file FROM productioncenter_productioncentercertificate WHERE production_center_id IN (?)`, [centerIds]);
        }

        const formatted = formatCenterData(centers, certs);
        
        const responseData = {
            total: totalCount,
            page: page,
            limit: limit,
            count: formatted.length,
            results: formatted
        };

        res.json(responseData);

    } catch (err) {
        console.error("Error getProductionCenters:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.createProductionCenter = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const body = req.body;
        const files = req.files;
        const userId = req.user?.id || 1; 

        // 1️⃣ Insert Production Center
        const [result] = await connection.query(
            `INSERT INTO productioncenter_productioncenter
            (production_type, status, name_of_production_centre,
             complete_address, district_id, block_id, village_id, contact_person, mobile_number,
             latitude, longitude, nursery_capacity, certification_details, nursery_category , department_id , area , created_by_id)
            VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [
                body.production_type || 'government',
                body.name_of_production_centre,
                body.complete_address,
                body.district_id,
                body.block_id,
                body.village_id,
                body.contact_person,
                body.mobile_number,
                body.latitude,
                body.longitude,
                body.nursery_capacity,
                body.certification_details,
                body.nursery_category ,
                body.department_id ,
                body.area_acres ,
                userId
            ]
        );

        const centerId = result.insertId;

        //  Generate unique center code
        const code = `PDC${centerId.toString().padStart(4, '0')}`;
        await connection.query(
            'UPDATE productioncenter_productioncenter SET production_center_code = ? WHERE id = ?',
            [code, centerId]
        );

        //  Save uploaded certificates
        if (files && files.length > 0) {
            const certValues = files.map(file => [centerId, file.path]);
            await connection.query(
                'INSERT INTO productioncenter_productioncentercertificate (production_center_id, certificate_file) VALUES ?',
                [certValues]
            );
        }

        //  Auto-generate certificate for private centers
        if (body.production_type === 'private') {
            console.log('Private center: generate certificate PDF');
        }

        // Commit transaction
        await connection.commit();

        // ✅ CLEAR CACHE: Remove stored cache after successful creation
        if (typeof clearProductionCenterCache === 'function') {
            await clearProductionCenterCache();
        }

        res.status(201).json({
            id: centerId,
            production_center_code: code,
            status: 'pending'
        });

    } catch (err) {
        await connection.rollback();
        console.error("Create Production Center Error:", err);
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
    }
};

exports.updateProductionCenter = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "ID is required" });

        const body = req.body;

        const allowedFields = [
            'status', 
            'status_updated_by', 
            'rejected_comment',
            'name_of_production_centre', 
            'contact_person', 
            'mobile_number', 
            'district_id', 
            'block_id', 
            'village_id', 
            'department_id',
            'latitude', 
            'longitude', 
            'complete_address', 
            'nursery_category', 
            'nursery_capacity'
        ];

        // 2. Build Dynamic Query
        const updates = [];
        const values = [];

        allowedFields.forEach(field => {
            // Only add to query if the field exists in the request body
            if (body[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(body[field]);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({ error: "No valid fields provided for update" });
        }

        // 3. Execute Update
        values.push(id); // Add ID for WHERE clause
        await db.query(
            `UPDATE productioncenter_productioncenter SET ${updates.join(', ')} WHERE id = ?`, 
            values
        );

        // 4. Return Updated Data
        // Reuse the GET function to return the formatted result
        req.query.id = id;
        return exports.getProductionCenters(req, res);

    } catch (err) {
        console.error("Update Production Center Error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteProductionCenter = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        await db.query('DELETE FROM productioncenter_productioncenter WHERE id = ?', [id]);
        
        await clearProductionCenterCache(); // Clear Cache
        
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getNearbyProductionCenters = async (req, res) => {
    try {
        const { farmer_id } = req.query;

        if (!farmer_id) {
            return res.status(400).json({ error: "Farmer ID is required" });
        }

        // 1. Get Farmer Details (Location + Preferred Species)
        const [farmers] = await db.query(
            `SELECT village_id, block_id, district_id, species_preferred 
             FROM users_farmeraathardetails 
             WHERE farmer_id = ?`, 
            [farmer_id]
        );

        if (farmers.length === 0) {
            return res.status(404).json({ error: "Farmer not found" });
        }

        const farmer = farmers[0];
        const { village_id, block_id, district_id, species_preferred } = farmer;

        // 2. Parse Species Preferred (JSON string -> Array)
        let preferredSpeciesIds = [];
        try {
            if (species_preferred) {
                preferredSpeciesIds = JSON.parse(species_preferred);
            }
        } catch (e) {
            console.error("Error parsing species_preferred JSON", e);
        }

        // If no species preferred, return empty result immediately
        if (preferredSpeciesIds.length === 0) {
            return res.json({ count: 0, results: [] });
        }

        // 3. Construct Main Query
        // LOGIC CHANGE:
        // - JOIN with 'productioncenter_stockdetails' -> This filters OUT centers that don't have the species.
        // - Use 'DISTINCT' -> To prevent duplicate rows if a center has multiple matching species.
        // - Proximity Score -> Used for sorting the filtered results.
        
        const query = `
            SELECT DISTINCT
                pc.*, 
                d.District_Name as district_name,
                b.Block_Name as block_name,
                v.Village_Name as village_name,
                -- Calculate Location Proximity Score
                CASE 
                    WHEN pc.village_id = ? THEN 3 
                    WHEN pc.block_id = ? THEN 2 
                    WHEN pc.district_id = ? THEN 1 
                    ELSE 0 
                END as proximity_score
            FROM productioncenter_productioncenter pc
            JOIN productioncenter_stockdetails sd ON pc.id = sd.production_center_id
            LEFT JOIN master_district d ON pc.district_id = d.id
            LEFT JOIN master_block b ON pc.block_id = b.id
            LEFT JOIN master_village v ON pc.village_id = v.id
            WHERE pc.status = 'approved' 
              AND sd.species_id IN (?) -- ✅ Filter by preferred species IDs
            ORDER BY proximity_score DESC, pc.id DESC
        `;

        const params = [
            village_id,
            block_id,
            district_id,
            preferredSpeciesIds // Pass the array of species IDs [15, 17, 18]
        ];

        const [centers] = await db.query(query, params);

        res.json({ 
            count: centers.length, 
            results: centers 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getDistrictSummary = async (req, res) => {
    try {
        const [districts] = await db.query(`
            SELECT id, District_Name 
            FROM master_district 
            ORDER BY District_Name ASC
        `);

        const [speciesList] = await db.query(`
            SELECT id, name AS species_name 
            FROM tbl_agroforest_trees 
            ORDER BY id ASC
        `);

        const districtSummaries = [];

        for (const district of districts) {

            // ❌ OLD: WHERE district = ? ... [district.id]
            // ✅ FIXED: Assuming the production center table stores the NAME, not the ID.
            // If your DB stores IDs, change this back to district.id.
            const [centers] = await db.query(`
                SELECT id 
                FROM productioncenter_productioncenter 
                WHERE district_id = ? AND status = 'approved'
            `, [district.id]); 

            const productionCenterCount = centers.length;
            const centerIds = centers.map(c => c.id);

            // Initialize default structure
            const saplingsPerDistrict = speciesList.map(s => ({
                species_id: s.id,
                species_name: s.species_name,
                total_quantity: 0
            }));

            let totalSaplings = 0;
            let totalSales = 0;
            let totalTarget = 0;

            if (centerIds.length > 0) {

                const [saplings] = await db.query(`
  SELECT t.name AS species_name,
         SUM(s.saplings_available) AS total_quantity,
         SUM(s.saplings_available * s.price_per_sapling) AS sales
  FROM productioncenter_stockdetails s
  JOIN tbl_agroforest_trees t ON s.species_id = t.id
  WHERE s.production_center_id IN (?)
  GROUP BY t.name
`, [centerIds]);
                // ✅ FIXED MATCHING: Case-insensitive and trim whitespace
                saplingsPerDistrict.forEach(s => {
                    const match = saplings.find(sp => 
                        sp.species_name && 
                        s.species_name && 
                        sp.species_name.toLowerCase().trim() === s.species_name.toLowerCase().trim()
                    );
                    
                    if (match) {
                        // Ensure values are Numbers
                        const qty = Number(match.total_quantity) || 0;
                        const sale = Number(match.sales) || 0;

                        s.total_quantity = qty;
                        totalSaplings += qty;
                        totalSales += sale;
                    }
                });

                  const [targets] = await db.query(`
                SELECT SUM(target_quantity) AS total_target
                FROM target_district
                WHERE district_id = ?
            `, [district.id]);

            totalTarget = targets[0]?.total_target || 0;
            }

            districtSummaries.push({
                district_id: district.id,
                district_name: district.District_Name,
                production_center_count: productionCenterCount,
                saplings: saplingsPerDistrict.filter(s => s.total_quantity > 0), 
                total_stock_saplings: totalSaplings,
                total_sales_price: totalSales,
                total_target: totalTarget
            });
        }

        res.json({
            count: districtSummaries.length,
            districts: districtSummaries
        });

    } catch (err) {
        console.error("District Summary Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getSingleDistrictSummary = async (req, res) => {
    try {
        // 1. Get district_id from Query Parameters (e.g., ?district_id=2)
        const { district_id } = req.query;

        if (!district_id) {
            return res.status(400).json({ error: "district_id query parameter is required" });
        }

        // 2. Get District Name
        const [districtRows] = await db.query(`SELECT District_Name FROM master_district WHERE id = ?`, [district_id]);
        if (districtRows.length === 0) {
            return res.status(404).json({ error: "District not found" });
        }
        const districtName = districtRows[0].District_Name;

        // 3. Define Queries
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT pc.id) AS total_production_centers,
                COALESCE(SUM(ps.saplings_available), 0) AS total_stock_count,
                COALESCE(SUM(ps.total_selled), 0) AS total_sales_count,
                COALESCE(SUM(ps.total_selled_price), 0) AS total_sale_price
            FROM productioncenter_productioncenter pc
            LEFT JOIN productioncenter_stockdetails ps ON pc.id = ps.production_center_id
            WHERE pc.district_id = ? 
        `;

        const targetQuery = `
            SELECT COALESCE(SUM(tp.target_quantity), 0) AS total_target
            FROM target_productioncenter tp
            JOIN productioncenter_productioncenter pc ON tp.productioncenter_id = pc.id
            WHERE pc.district_id = ?
        `;

        const saplingsQuery = `
            SELECT 
                t.s_name, 
                SUM(ps.saplings_available) AS count
            FROM productioncenter_stockdetails ps
            JOIN productioncenter_productioncenter pc ON ps.production_center_id = pc.id
            JOIN tbl_agroforest_trees t ON ps.species_id = t.id
            WHERE pc.district_id = ? 
            GROUP BY t.s_name
        `;

        // 4. Run in Parallel
        const [[statsResult], [targetResult], [saplingsResult]] = await Promise.all([
            db.query(statsQuery, [district_id]),
            db.query(targetQuery, [district_id]),
            db.query(saplingsQuery, [district_id])
        ]);

        // 5. Construct Payload
        const responseData = {
            district: districtName,
            saplings: saplingsResult,
            total_production_centers: statsResult[0].total_production_centers || 0,
            total_stock_sapling: statsResult[0].total_stock_count,     
            total_sale_saplingcount: statsResult[0].total_sales_count,  
            total_sale_price: statsResult[0].total_sale_price,
            target: targetResult[0].total_target
        };

        res.status(200).json(responseData);

    } catch (err) {
        console.error("Get Single District Summary Error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getBlockSummary = async (req, res) => {
    try {
        // 1. Get dist_id from query parameters
        const { dist_id } = req.query;

        // 2. Construct Query
        // IMPORTANT: We use 'Dist_Name' in the WHERE clause because your data shows 
        // the District ID is stored in this column, not in 'district_id'.
        let blockQuery = "SELECT id, Block_Name FROM master_block";
        const queryParams = [];

        if (dist_id) {
            blockQuery += " WHERE Dist_Name = ?";
            queryParams.push(dist_id);
        }

        blockQuery += " ORDER BY Block_Name ASC";

        // Fetch blocks
        const [blocks] = await db.query(blockQuery, queryParams);

        // Fetch species list
        const [speciesList] = await db.query(`
            SELECT id, name AS species_name 
            FROM tbl_agroforest_trees 
            ORDER BY id ASC
        `);

        const blockSummaries = [];

        for (const block of blocks) {
            // Find production centers for this block
            const [centers] = await db.query(`
                SELECT id 
                FROM productioncenter_productioncenter 
                WHERE block_id = ? AND status = 'approved'
            `, [block.id]);

            const productionCenterCount = centers.length;
            const centerIds = centers.map(c => c.id);

            // Initialize default structure for species
            const saplingsPerBlock = speciesList.map(s => ({
                species_id: s.id,
                species_name: s.species_name,
                total_quantity: 0
            }));

            let totalSaplings = 0;
            let totalSales = 0;
            let totalTarget = 0;

            if (centerIds.length > 0) {
                // Fetch Stock
                const [saplings] = await db.query(`
                    SELECT t.name AS species_name,
                           SUM(s.saplings_available) AS total_quantity,
                           SUM(s.saplings_available * s.price_per_sapling) AS sales
                    FROM productioncenter_stockdetails s
                    JOIN tbl_agroforest_trees t ON s.species_id = t.id
                    WHERE s.production_center_id IN (?)
                    GROUP BY t.name
                `, [centerIds]);

                // Match species
                saplingsPerBlock.forEach(s => {
                    const match = saplings.find(sp => 
                        sp.species_name && 
                        s.species_name && 
                        sp.species_name.toLowerCase().trim() === s.species_name.toLowerCase().trim()
                    );
                    
                    if (match) {
                        const qty = Number(match.total_quantity) || 0;
                        const sale = Number(match.sales) || 0;

                        s.total_quantity = qty;
                        totalSaplings += qty;
                        totalSales += sale;
                    }
                });

                // Fetch Targets
                const [targets] = await db.query(`
                    SELECT SUM(target_quantity) AS total_target
                    FROM target_productioncenter
                    WHERE productioncenter_id IN (?)
                `, [centerIds]);

                totalTarget = targets[0].total_target || 0;
            }

            blockSummaries.push({
                block_id: block.id,
                block_name: block.Block_Name,
                production_center_count: productionCenterCount,
                saplings: saplingsPerBlock.filter(s => s.total_quantity > 0), 
                total_stock_saplings: totalSaplings,
                total_sales_price: totalSales,
                total_target: totalTarget
            });
        }

        res.json({
            count: blockSummaries.length,
            blocks: blockSummaries
        });

    } catch (err) {
        console.error("Block Summary Error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getProductionCenterSummary = async (req, res) => {
    try {
        // 1. Get block_id from query parameters
        const { block_id } = req.query;

        // 2. Base Query and Params
        let centerQuery = `
            SELECT id, name_of_production_centre 
            FROM productioncenter_productioncenter 
            WHERE status = 'approved'
        `;
        const queryParams = [];

        // 3. Filter by block_id if provided
        if (block_id) {
            centerQuery += " AND block_id = ?";
            queryParams.push(block_id);
        }

        centerQuery += " ORDER BY name_of_production_centre ASC";

        // Fetch centers
        const [centers] = await db.query(centerQuery, queryParams);

        // Fetch species list
        const [speciesList] = await db.query(`
            SELECT id, name AS species_name 
            FROM tbl_agroforest_trees 
            ORDER BY id ASC
        `);

        const centerSummaries = [];

        for (const center of centers) {
            // Fetch Stock for this center
            const [saplings] = await db.query(`
                SELECT 
                    t.name AS species_name,
                    SUM(s.saplings_available) AS total_quantity,
                    SUM(s.saplings_available * s.price_per_sapling) AS sales
                FROM productioncenter_stockdetails s
                JOIN tbl_agroforest_trees t ON s.species_id = t.id
                WHERE s.production_center_id = ?
                GROUP BY t.name
            `, [center.id]);

            // Initialize default structure
            const saplingsPerCenter = speciesList.map(s => ({
                species_id: s.id,
                species_name: s.species_name,
                total_quantity: 0
            }));

            let totalSaplings = 0;
            let totalSales = 0;
            let totalTarget = 0;

            // Match species
            saplingsPerCenter.forEach(s => {
                const match = saplings.find(sp => 
                    sp.species_name && 
                    s.species_name && 
                    sp.species_name.toLowerCase().trim() === s.species_name.toLowerCase().trim()
                );
                
                if (match) {
                    const qty = Number(match.total_quantity) || 0;
                    const sale = Number(match.sales) || 0;

                    s.total_quantity = qty;
                    totalSaplings += qty;
                    totalSales += sale;
                }
            });

            // Fetch Targets
            const [targets] = await db.query(`
                SELECT SUM(target_quantity) AS total_target
                FROM target_productioncenter
                WHERE productioncenter_id = ?
            `, [center.id]);

            totalTarget = targets[0].total_target || 0;

            centerSummaries.push({
                center_id: center.id,
                center_name: center.name_of_production_centre,
                saplings: saplingsPerCenter.filter(s => s.total_quantity > 0), 
                total_stock_saplings: totalSaplings,
                total_sales_price: totalSales,
                total_target: totalTarget
            });
        }

        res.json({
            count: centerSummaries.length,
            centers: centerSummaries
        });

    } catch (err) {
        console.error("Production Center Summary Error:", err);
        res.status(500).json({ error: err.message });
    }
};
