import fs from "fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../../.env.railway", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const key = t.slice(0, eq).trim();
  if (!process.env[key]) process.env[key] = t.slice(eq + 1).trim();
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=plano_ideal",
});

await pool.query("UPDATE pap_bo_credentials SET in_use_by = NULL, locked_at = NULL");
await pool.query(`
  UPDATE credit_consultations
  SET status = 'queued', started_at = NULL, error_message = NULL, finished_at = NULL
  WHERE id = 2 AND status = 'processing'
`);
const r = await pool.query(
  "SELECT id, status, error_message FROM credit_consultations ORDER BY id"
);
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
