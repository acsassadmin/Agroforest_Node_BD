const db = require('../../db'); 
const redisClient = require('../../redisClient'); 

const CACHE_KEY = 'production_schemes_list';

// 1. GET
exports.getProductionSchemes = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const cachedData = await redisClient.get(CACHE_KEY);
        if (cachedData) {
            return res.json(JSON.parse(cachedData));
        }

        const query = `
            SELECT 
                ps.id,
                pc.name_of_production_centre AS center_name,
                pc.id AS center_id,
                s.name AS scheme_name,
                s.id AS scheme_id,
                ps.created_at,
                ps.updated_at,
                uc.username AS created_by_name,
                uu.username AS updated_by_name
            FROM production_center_schemes ps
            JOIN productioncenter_productioncenter pc ON ps.production_center_id = pc.id
            JOIN tn_schema s ON ps.scheme_id = s.id
            LEFT JOIN users_customuser uc ON ps.created_by = uc.id
            LEFT JOIN users_customuser uu ON ps.updated_by = uu.id
            ORDER BY ps.created_at DESC
            LIMIT ? OFFSET ?
        `;
        const [rows] = await db.query(query, [limit, offset]);

        await redisClient.set(CACHE_KEY, JSON.stringify(rows), 'EX', 3600);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

const clearCache = async () => {
    try {
        await redisClient.del(CACHE_KEY);
    } catch (err) {
        console.error("Redis Clear Error:", err);
    }
};
// create productio scheme 
exports.createProductionScheme = async (req, res) => {
    const { production_center_id, scheme_id, created_by } = req.body;

    try {
        // Step 1: Check if center has valid target quantity for this scheme
        const [targetData] = await db.query(
            `SELECT target_quantity, scheme_type 
             FROM target_productioncenter 
             WHERE productioncenter_id = ? AND scheme_id = ?`, 
            [production_center_id, scheme_id]
        );

        // If no record found OR target_quantity is not valid (null, 0, or negative)
        if (
            targetData.length === 0 || 
            !targetData[0].target_quantity || 
            targetData[0].target_quantity <= 0
        ) {
            return res.status(400).json({ 
                error: "Cannot assign. No valid target quantity found for this center and scheme combination." 
            });
        }

        // Step 2: Check if already assigned in production_center_schemes
        const [existing] = await db.query(
            `SELECT id FROM production_center_schemes 
             WHERE production_center_id = ? AND scheme_id = ?`, 
            [production_center_id, scheme_id]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: "Already assigned." });
        }

        // Step 3: Insert the assignment
        const [result] = await db.query(
            `INSERT INTO production_center_schemes (production_center_id, scheme_id, created_by) VALUES (?, ?, ?)`,
            [production_center_id, scheme_id, created_by]
        );

        await clearCache();
        
        res.status(201).json({ 
            id: result.insertId, 
            message: "Assigned successfully",
            target_quantity: targetData[0].target_quantity
        });
        
    } catch (err) {
        console.error("Create Error:", err);
        res.status(400).json({ error: err.message });
    }
};


//  ADD THIS UPDATE FUNCTION
exports.updateProductionScheme = async (req, res) => {
    const { id } = req.params; // ID of the mapping record
    const { production_center_id, scheme_id, updated_by } = req.body;

    try {
        // Step 1: Check if the NEW combination has a valid target quantity
        const [targetData] = await db.query(
            `SELECT target_quantity 
             FROM target_productioncenter 
             WHERE productioncenter_id = ? AND scheme_id = ?`, 
            [production_center_id, scheme_id]
        );

        // If no record found OR target_quantity is not valid (null, 0, or negative)
        if (
            targetData.length === 0 || 
            !targetData[0].target_quantity || 
            targetData[0].target_quantity <= 0
        ) {
            return res.status(400).json({ 
                error: "Cannot update. No valid target quantity found for this new center and scheme combination." 
            });
        }

        // Step 2: Check if the NEW combination already exists (excluding the current record ID)
        const [existing] = await db.query(
            `SELECT id FROM production_center_schemes 
             WHERE production_center_id = ? AND scheme_id = ? AND id != ?`, 
            [production_center_id, scheme_id, id]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: "This assignment already exists." });
        }

        // Step 3: Update the record
        const [result] = await db.query(
            `UPDATE production_center_schemes 
             SET production_center_id = ?, scheme_id = ?, updated_by = ? 
             WHERE id = ?`,
            [production_center_id, scheme_id, updated_by, id]
        );

        // Safety check: If no rows were affected, the ID doesn't exist
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Assignment record not found." });
        }

        // Step 4: Clear Cache
        await clearCache();

        // Step 5: Return updated record
        const [rows] = await db.query(`SELECT * FROM production_center_schemes WHERE id = ?`, [id]);
        res.json(rows[0]);

    } catch (err) {
        console.error("Update Error:", err);
        res.status(400).json({ error: err.message });
    }
};


// 3. DELETE (Fixed Table Name)
exports.deleteProductionScheme = async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID is required" });

    try {
        // Using production_center_schemes
        await db.query(`DELETE FROM production_center_schemes WHERE id = ?`, [id]);
        
        await clearCache();
        res.status(204).send();
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ error: err.message });
    }
};