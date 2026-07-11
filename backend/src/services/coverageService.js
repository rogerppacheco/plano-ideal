import { pool } from "../db.js";

export async function countCoverageByCep(cepDigits) {
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::INT AS total
      FROM coverage_records
      WHERE cep_digits = $1
    `,
    [cepDigits]
  );

  return rows[0]?.total ?? 0;
}

export async function getCoverageByCep(cepDigits) {
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

  return {
    cep: cepDigits,
    operators: operatorsResult.rows.map((row) => row.operator),
    records: detailsResult.rows,
  };
}
