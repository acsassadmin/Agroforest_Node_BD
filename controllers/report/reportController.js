const db = require("../../db");
const ExcelJS = require("exceljs");

exports.generateReportExcel = async (req, res) => {
  try {
    const { role } = req.query || {}; 

    let query = `
      SELECT 
        d.District_Name AS district,
        pc.name_of_production_centre AS production_center,
        (SELECT COUNT(id) FROM tbl_agroforest_trees) AS species_count,
        COALESCE(SUM(t.target_quantity), 0) AS total_target
      FROM master_district d
      CROSS JOIN productioncenter_productioncenter pc
      LEFT JOIN target t 
        ON t.role = 'production_center' AND t.target_tag = pc.id
      GROUP BY d.District_Name, pc.name_of_production_centre
      ORDER BY d.District_Name ASC, pc.name_of_production_centre ASC
    `;

    // Fetch data from DB
    const [report] = await db.query(query);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Target Report");

    // Define columns
    worksheet.columns = [
      { header: "District", key: "district", width: 30 },
      { header: "Production Center", key: "production_center", width: 30 },
      { header: "Species Count", key: "species_count", width: 15 },
      { header: "Total Target", key: "total_target", width: 15 },
    ];

    // Add rows
    report.forEach(row => {
      worksheet.addRow({
        district: row.district,
        production_center: row.production_center,
        species_count: row.species_count || 0,
        total_target: row.total_target || 0,
      });
    });

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=target_report.xlsx"
    );

    // Write Excel to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Generate Report Excel Error:", err);
    res.status(500).json({ error: err.message });
  }
};