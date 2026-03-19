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
exports.uploadMiddleware = upload.array('certificate_files', 10);

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
            production_center_type_name: center.type_name,
            certificates: centerCerts
        };
    });
};

// --- PRODUCTION CENTER LOGIC ---

exports.getProductionCenters = async (req, res) => {
    try {
        const { id, search, type, page = 1 } = req.query;

        // 1. Define Cache Key (Must be unique for every filter combination)
        const cacheKey = `production_center_${id || 'all'}_${search || 'na'}_${type || 'na'}_page${page}`;

        // 2. Check Redis
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            return res.json(JSON.parse(cachedData));
        }

        // 3. Single Item Logic
        if (id) {
            const [centers] = await db.query(`
                SELECT pc.*, pct.name as type_name 
                FROM productioncenter_productioncenter pc
                JOIN productioncenter_productioncentertypes pct ON pc.production_center_type_id = pct.id
                WHERE pc.id = ?`, [id]);

            if (centers.length === 0) return res.status(404).json({ error: "Production Center not found" });

            const [certs] = await db.query('SELECT id, certificate_file FROM productioncenter_productioncentercertificate WHERE production_center_id = ?', [id]);
            
            const formatted = formatCenterData(centers, certs);
            
            // Set Cache
            await redisClient.set(cacheKey, JSON.stringify(formatted[0]), { EX: 3600 });
            return res.json(formatted[0]);
        }

        // 4. List Logic
        let query = `
            SELECT pc.*, pct.name as type_name 
            FROM productioncenter_productioncenter pc
            JOIN productioncenter_productioncentertypes pct ON pc.production_center_type_id = pct.id
            WHERE 1=1`;
        const params = [];

        if (type) {
            query += ' AND pc.production_center_type_id = ?';
            params.push(type);
        }
        if (search) {
            query += ' AND (pc.name_of_production_centre LIKE ? OR pc.contact_person LIKE ? OR pc.mobile_number LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        query += ' ORDER BY pc.id DESC';

        const [centers] = await db.query(query, params);
        
        const centerIds = centers.map(c => c.id);
        let certs = [];
        if (centerIds.length > 0) {
            [certs] = await db.query(`SELECT id, production_center_id, certificate_file FROM productioncenter_productioncentercertificate WHERE production_center_id IN (?)`, [centerIds]);
        }

        const formatted = formatCenterData(centers, certs);
        const responseData = { count: formatted.length, results: formatted };

        // Set Cache
        await redisClient.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });
        res.json(responseData);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProductionCenter = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const body = req.body;
        const files = req.files;

        const [result] = await connection.query(
            `INSERT INTO productioncenter_productioncenter 
            (production_center_type_id, name_of_production_centre, complete_address, district, taluk, block, village, contact_person, mobile_number, latitude, longitude, nursery_capacity, certification_details, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                body.production_center_type, body.name_of_production_centre, body.complete_address, body.district, body.taluk, body.block, body.village, body.contact_person, body.mobile_number, body.latitude, body.longitude, body.nursery_capacity, body.certification_details, req.user?.id || 1
            ]
        );

        const centerId = result.insertId;
        const code = `PDC${centerId.toString().padStart(4, '0')}`;
        await connection.query('UPDATE productioncenter_productioncenter SET production_center_code = ? WHERE id = ?', [code, centerId]);

        if (files && files.length > 0) {
            const certValues = files.map(file => [centerId, file.path]);
            await connection.query('INSERT INTO productioncenter_productioncentercertificate (production_center_id, certificate_file) VALUES ?', [certValues]);
        }

        await connection.commit();
        await clearProductionCenterCache(); // Clear Cache
        
        req.query.id = centerId;
        return exports.getProductionCenters(req, res);

    } catch (err) {
        await connection.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
    }
};

exports.updateProductionCenter = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        await connection.beginTransaction();
        const body = req.body;
        const files = req.files;

        await connection.query(
            `UPDATE productioncenter_productioncenter SET 
            production_center_type_id = ?, name_of_production_centre = ?, complete_address = ?, 
            district = ?, taluk = ?, block = ?, village = ?, contact_person = ?, mobile_number = ?, 
            latitude = ?, longitude = ?, nursery_capacity = ?, certification_details = ?
            WHERE id = ?`,
            [
                body.production_center_type, body.name_of_production_centre, body.complete_address,
                body.district, body.taluk, body.block, body.village, body.contact_person, body.mobile_number,
                body.latitude, body.longitude, body.nursery_capacity, body.certification_details, id
            ]
        );

        if (files && files.length > 0) {
            const certValues = files.map(file => [id, file.path]);
            await connection.query('INSERT INTO productioncenter_productioncentercertificate (production_center_id, certificate_file) VALUES ?', [certValues]);
        }

        await connection.commit();
        await clearProductionCenterCache(); // Clear Cache

        req.query.id = id;
        return exports.getProductionCenters(req, res);

    } catch (err) {
        await connection.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
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