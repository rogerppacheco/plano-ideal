import dotenv from "dotenv";
import { pool } from "../src/db.js";
import { ensureSchema } from "../src/initSchema.js";

dotenv.config();

await ensureSchema();

const tables = await pool.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = current_schema()
    AND table_name IN ('partners', 'api_keys')
  ORDER BY table_name
`);

const originCheck = await pool.query(`
  SELECT conname
  FROM pg_constraint
  WHERE conname = 'credit_consultations_origin_check'
`);

console.log("tables:", tables.rows);
console.log("origin_check:", originCheck.rows);

await pool.end();
