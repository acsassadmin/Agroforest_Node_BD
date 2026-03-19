const db = require('../../db');
const redisClient = require('../../redisClient'); // Import your redis client

// Helper to clear cache for this module
const clearCache = async () => {
    // In Redis, we can't easily clear "keys starting with", 
    // so we delete the specific list cache used in GET.
    // If you have many pages cached, you might need a smarter flushing strategy.
    // For now, we delete the first page cache as an example.
    const keys = await redisClient.keys('distribution_centers_page*');
    if (keys.length > 0) {
        await redisClient.del(keys);
    }
};

// --- GET: List Distribution Centers (with Pagination & Cache) ---
exports.getDistributionCenters = async (req, res) => {
    try {
        const page = req.query.page || "1";
        const cacheKey = `distribution_centers_page${page}`;

        // 1. Check Cache
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            console.log("Serving from Redis Cache");
            return res.json(JSON.parse(cachedData));
        }

        // 2. Database Query
        const [countRows] = await db.query('SELECT COUNT(*) as count FROM productioncenter_distributioncenter');
        const totalItems = countRows[0].count;

        // Pagination Logic (StandardPagination usually handles 10 per page)
        const limit = 10;
        const offset = (parseInt(page) - 1) * limit;

        const [rows] = await db.query(
            `SELECT * FROM productioncenter_distributioncenter ORDER BY id DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        // 3. Structure Response (Like Django StandardPagination)
        const responseData = {
            count: totalItems,
            next: totalItems > (offset + limit) ? `?page=${parseInt(page) + 1}` : null,
            previous: parseInt(page) > 1 ? `?page=${parseInt(page) - 1}` : null,
            results: rows
        };

        // 4. Set Cache
        await redisClient.set(cacheKey, JSON.stringify(responseData), {
            EX: 3600 // Cache for 1 hour (3600 seconds)
        });

        res.json(responseData);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- POST: Create Distribution Center ---
exports.createDistributionCenter = async (req, res) => {
    try {
        const body = req.body;
        const userId = req.user?.id || 1; // From Auth Middleware

        const [result] = await db.query(
            `INSERT INTO productioncenter_distributioncenter 
            (name_of_distribution_centre, department, address, district, block, village, contact_person, mobile_number, latitude, longitude, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                body.name_of_distribution_centre, body.department, body.address, body.district, 
                body.block, body.village, body.contact_person, body.mobile_number, 
                body.latitude, body.longitude, userId
            ]
        );

        // Clear cache after creation
        await clearCache();

        // Return the created object
        const [newItem] = await db.query('SELECT * FROM productioncenter_distributioncenter WHERE id = ?', [result.insertId]);
        res.status(201).json(newItem[0]);

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// --- PUT: Update Distribution Center ---
exports.updateDistributionCenter = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        const body = req.body;

        // Build update query dynamically
        const fields = [];
        const values = [];
        
        // Only update fields that are provided
        const allowedFields = ['name_of_distribution_centre', 'department', 'address', 'district', 'block', 'village', 'contact_person', 'mobile_number', 'latitude', 'longitude'];
        
        allowedFields.forEach(field => {
            if (body[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(body[field]);
            }
        });

        if (fields.length === 0) {
            return res.status(400).json({ error: "No fields provided to update" });
        }

        values.push(id); // Add ID for WHERE clause

        await db.query(
            `UPDATE productioncenter_distributioncenter SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        await clearCache();

        // Return updated object
        const [updatedItem] = await db.query('SELECT * FROM productioncenter_distributioncenter WHERE id = ?', [id]);
        res.json(updatedItem[0]);

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// --- DELETE: Delete Distribution Center ---
exports.deleteDistributionCenter = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id is required" });

        const [result] = await db.query('DELETE FROM productioncenter_distributioncenter WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Distribution Center not found" });
        }

        await clearCache();
        res.status(204).send(); // No Content

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};