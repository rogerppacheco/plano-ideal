import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { normalizeCepDigits } from "../utils/cep.js";

const router = express.Router();

router.get("/public/viability/:cep", async (req, res) => {
  const cepDigits = normalizeCepDigits(req.params.cep);
  if (cepDigits.length !== 8) {
    return res.status(400).json({ message: "CEP inválido." });
  }

  const query = `
    SELECT COUNT(*)::INT AS total
    FROM coverage_records
    WHERE cep_digits = $1
  `;
  const { rows } = await pool.query(query, [cepDigits]);
  const total = rows[0]?.total ?? 0;
  const statusCode = total > 0 ? "V-OK" : "V-NOK";
  return res.json({ statusCode });
});

router.get("/coverage/:cep", requireAuth, async (req, res) => {
  const cepDigits = normalizeCepDigits(req.params.cep);
  if (cepDigits.length !== 8) {
    return res.status(400).json({ message: "CEP inválido." });
  }

  const operatorsQuery = `
    SELECT DISTINCT operator
    FROM coverage_records
    WHERE cep_digits = $1
    ORDER BY operator ASC
  `;
  const detailsQuery = `
    SELECT operator, source_file, sheet_name, row_data, imported_at
    FROM coverage_records
    WHERE cep_digits = $1
    ORDER BY operator ASC, imported_at DESC
    LIMIT 200
  `;

  const [operatorsResult, detailsResult] = await Promise.all([
    pool.query(operatorsQuery, [cepDigits]),
    pool.query(detailsQuery, [cepDigits]),
  ]);

  return res.json({
    cep: cepDigits,
    operators: operatorsResult.rows.map((row) => row.operator),
    records: detailsResult.rows,
  });
});

export default router;
