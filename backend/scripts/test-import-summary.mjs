import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, getDbSchema } from "../src/db.js";
import { ensureSchema } from "../src/initSchema.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const pool = createPool();
await ensureSchema();

const t0 = Date.now();
const totals = await pool.query(`
  SELECT operator, COALESCE(SUM(imported_rows), 0)::bigint AS total
  FROM import_jobs
  WHERE status = 'completed' AND reverted_at IS NULL
  GROUP BY operator
`);
const byOperator = Object.fromEntries(
  totals.rows.map((r) => [r.operator, Number(r.total) || 0])
);
const total = Object.values(byOperator).reduce((a, n) => a + n, 0);
console.log(`Totais (${Date.now() - t0} ms):`, byOperator, "total", total);

for (const operator of Object.keys(byOperator)) {
  const t1 = Date.now();
  const sample = await pool.query(
    `
      SELECT row_data FROM coverage_records
      WHERE operator = $1
      ORDER BY imported_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [operator]
  );
  const n = Object.keys(sample.rows[0]?.row_data || {}).length;
  console.log(`  campos ${operator}: ${n} (${Date.now() - t1} ms)`);
}

console.log(`\nTotal geral: ${total.toLocaleString("pt-BR")} linhas (jobs concluídos)`);
await pool.end();
