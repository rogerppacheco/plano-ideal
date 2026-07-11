import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const schemas = await pool.query(`
  SELECT table_schema, COUNT(*)::int AS users
  FROM information_schema.tables t
  JOIN LATERAL (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = t.table_schema AND c.relname = 'internal_users'
  ) x ON true
  WHERE table_name = 'internal_users'
  GROUP BY table_schema
`);

console.log("schemas com internal_users:", schemas.rows);

for (const schema of ["public", "plano_ideal"]) {
  try {
    const r = await pool.query(
      `SELECT id, username, role FROM ${schema}.internal_users ORDER BY id`
    );
    console.log(schema, r.rows);
  } catch (error) {
    console.log(schema, "erro:", error.message);
  }
}

const pathRes = await pool.query("SHOW search_path");
console.log("search_path atual:", pathRes.rows[0]?.search_path);

await pool.end();
