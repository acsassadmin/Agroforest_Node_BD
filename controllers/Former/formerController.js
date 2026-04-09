const db = require("../../db");

exports.uploadSapplings = async (req, res) => {
    try {
        const { farmerId, landId, totalSqfeet, lang, lati, prouductionId,total_count } = req.body;
        console.log(farmerId, landId, totalSqfeet, lang, lati, prouductionId,total_count);

        const imageUrl = req.file ? req.file.path : null;

        if (!farmerId || !landId || !totalSqfeet || !imageUrl || !lang || !lati,!prouductionId, !total_count) {
            return res.status(400).json({
                success: false,
                message: "All fields including image are required"
            });
        }

        const query = `
            INSERT INTO sapplings 
            (farmer_id, land_id, production_id,total_sqfeet, image_url, longitude, latitude, total_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            farmerId,
            landId,
            prouductionId,
            totalSqfeet,
            imageUrl,
            lang,
            lati,
            total_count
        ];

        await db.query(query, values); 

        res.status(200).json({
            success: true,
            message: "Sapling uploaded successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};
