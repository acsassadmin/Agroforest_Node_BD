const db = require('../db');
const multer = require('multer');
const path = require('path');

// --- FILE UPLOAD CONFIGURATION (Like Django FileField) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/production_center_certificates/'); // Ensure this folder exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Helper to handle file upload middleware
exports.uploadMiddleware = upload.array('certificate_files', 10); // 'certificate_files' matches Django field

// --- PRODUCTION CENTER TYPES LOGIC ---

// GET Production Center Types
exports.getProductionCenterTypes = async (req, res) => {
    try {
        const { id, search, page = 1 } = req.query;
        
        // Single Item Fetch
        if (id) {
            const [rows] = await db.query('SELECT * FROM productioncenter_productioncentertypes WHERE id = ?', [id]);
            if (rows.length === 0) return res.status(404).json({ error: "Type not found" });
            return res.json(rows[0]);
        }

        // List Fetch with Search
        let query = 'SELECT * FROM productioncenter_productioncentertypes';
        const params = [];
        
        if (search) {
            query += ' WHERE name LIKE ?';
            params.push(`%${search}%`);
        }
        
        query += ' ORDER BY id DESC';

        // Pagination logic (Simplified, you can add LIMIT/OFFSET here)
        const [rows] = await db.query(query, params);
        
        // Reshaping for Django Pagination style response
        res.json({
            count: rows.length,
            results: rows
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST Production Center Type
exports.createProductionCenterType = async (req, res) => {
    try {
        const { name } = req.body;
        const [result] = await db.query('INSERT INTO ProductionCenterTypes (name) VALUES (?)', [name]);
        res.status(201).json({ id: result.insertId, name });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// PUT Production Center Type
exports.updateProductionCenterType = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        const { name } = req.body;
        await db.query('UPDATE ProductionCenterTypes SET name = ? WHERE id = ?', [name, id]);
        
        const [rows] = await db.query('SELECT * FROM ProductionCenterTypes WHERE id = ?', [id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// DELETE Production Center Type
exports.deleteProductionCenterType = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });
        await db.query('DELETE FROM ProductionCenterTypes WHERE id = ?', [id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// --- PRODUCTION CENTER LOGIC ---

// Helper function to structure data like Django Serializer
const formatCenterData = (centers, certificates) => {
    return centers.map(center => {
        // Filter certificates belonging to this center
        const centerCerts = certificates
            .filter(cert => cert.production_center_id === center.id)
            .map(cert => ({
                id: cert.id,
                certificate_file: cert.certificate_file // URL path
            }));

        return {
            ...center,
            production_center_type_name: center.type_name, // Renaming for serializer match
            certificates: centerCerts
        };
    });
};

// GET Production Centers
exports.getProductionCenters = async (req, res) => {
    try {
        const { id, search, type, page = 1 } = req.query;

        // Single Item
        if (id) {
            const [centers] = await db.query(`
                SELECT pc.*, pct.name as type_name 
                FROM ProductionCenter pc
                JOIN ProductionCenterTypes pct ON pc.production_center_type_id = pct.id
                WHERE pc.id = ?`, [id]);

            if (centers.length === 0) return res.status(404).json({ error: "Production Center not found" });

            const [certs] = await db.query('SELECT id, certificate_file FROM ProductionCenterCertificate WHERE production_center_id = ?', [id]);
            
            const formatted = formatCenterData(centers, certs);
            return res.json(formatted[0]);
        }

        // List View
        let query = `
            SELECT pc.*, pct.name as type_name 
            FROM ProductionCenter pc
            JOIN ProductionCenterTypes pct ON pc.production_center_type_id = pct.id
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
        
        // Get all certificates for these centers (Optimization)
        const centerIds = centers.map(c => c.id);
        let certs = [];
        if (centerIds.length > 0) {
            [certs] = await db.query(`SELECT id, production_center_id, certificate_file FROM ProductionCenterCertificate WHERE production_center_id IN (?)`, [centerIds]);
        }

        const formatted = formatCenterData(centers, certs);

        res.json({
            count: formatted.length,
            results: formatted
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST Production Center
exports.createProductionCenter = async (req, res) => {
    const connection = await db.getConnection(); // Get connection for transaction
    try {
        await connection.beginTransaction();

        const body = req.body;
        const files = req.files; // From Multer

        // 1. Insert Production Center
        const [result] = await connection.query(
            `INSERT INTO ProductionCenter 
            (production_center_type_id, name_of_production_centre, complete_address, district, taluk, block, village, contact_person, mobile_number, latitude, longitude, nursery_capacity, certification_details, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                body.production_center_type, body.name_of_production_centre, body.complete_address, body.district, body.taluk, body.block, body.village, body.contact_person, body.mobile_number, body.latitude, body.longitude, body.nursery_capacity, body.certification_details, req.user?.id || 1 // Assuming middleware sets req.user
            ]
        );

        const centerId = result.insertId;

        // 2. Generate Code (Signal logic equivalent)
        const code = `PDC${centerId.toString().padStart(4, '0')}`;
        await connection.query('UPDATE ProductionCenter SET production_center_code = ? WHERE id = ?', [code, centerId]);

        // 3. Upload Certificates
        if (files && files.length > 0) {
            const certValues = files.map(file => [centerId, file.path]);
            await connection.query('INSERT INTO ProductionCenterCertificate (production_center_id, certificate_file) VALUES ?', [certValues]);
        }

        await connection.commit();
        
        // Fetch and return the created object
        req.query.id = centerId;
        return exports.getProductionCenters(req, res); // Reuse GET logic to return exact structure

    } catch (err) {
        await connection.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
    }
};

// PUT Production Center
exports.updateProductionCenter = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        await connection.beginTransaction();

        const body = req.body;
        const files = req.files;

        // Update Main Table
        await connection.query(
            `UPDATE ProductionCenter SET 
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

        // Add new certificates if uploaded
        if (files && files.length > 0) {
            const certValues = files.map(file => [id, file.path]);
            await connection.query('INSERT INTO ProductionCenterCertificate (production_center_id, certificate_file) VALUES ?', [certValues]);
        }

        await connection.commit();

        // Fetch and return
        req.query.id = id;
        return exports.getProductionCenters(req, res);

    } catch (err) {
        await connection.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
    }
};

// DELETE Production Center
exports.deleteProductionCenter = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        // Assuming ON DELETE CASCADE in DB, else delete certificates manually
        await db.query('DELETE FROM ProductionCenter WHERE id = ?', [id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};