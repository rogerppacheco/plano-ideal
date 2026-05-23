import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, getDbSchema } from "../src/db.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const pool = createPool();
const schema = getDbSchema();

const size = await pool.query(`
  SELECT
    pg_database_size(current_database()) AS db_bytes,
    pg_total_relation_size($1::regclass) AS coverage_bytes,
    pg_indexes_size($1::regclass) AS index_bytes
`, [`${schema}.coverage_records`]);

const counts = await pool.query(`
  SELECT
    (SELECT COUNT(*)::bigint FROM ${schema}.coverage_records) AS coverage_rows,
    (SELECT COUNT(*)::bigint FROM ${schema}.import_jobs WHERE status = 'completed') AS jobs_completed,
    (SELECT COUNT(*)::bigint FROM ${schema}.import_jobs WHERE status = 'failed') AS jobs_failed,
    (SELECT COALESCE(SUM(imported_rows), 0)::bigint FROM ${schema}.import_jobs WHERE status = 'completed' AND operator = 'Vivo') AS vivo_rows_in_jobs
`);

const ftth = await pool.query(`
  SELECT COUNT(DISTINCT f.file_name)::int AS ftth_files_done
  FROM ${schema}.import_jobs j
  JOIN ${schema}.import_job_files f ON f.job_id = j.id
  WHERE j.status = 'completed' AND j.operator = 'Vivo'
    AND f.file_name ~ '^[A-Z]{2}(_[0-9]+)?\\.xlsx$'
`);

const row = { ...size.rows[0], ...counts.rows[0], ...ftth.rows[0] };
const gb = (n) => (Number(n) / 1024 ** 3).toFixed(2);

console.log(JSON.stringify({
  db_gb: gb(row.db_bytes),
  coverage_table_gb: gb(row.coverage_bytes),
  indexes_gb: gb(row.index_bytes),
  coverage_rows: Number(row.coverage_rows),
  jobs_completed: Number(row.jobs_completed),
  jobs_failed: Number(row.jobs_failed),
  ftth_xlsx_completed: Number(row.ftth_files_done),
  bytes_per_row: Math.round(Number(row.coverage_bytes) / Number(row.coverage_rows)),
}, null, 2));

await pool.end();
