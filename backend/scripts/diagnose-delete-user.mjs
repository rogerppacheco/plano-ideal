import dotenv from "dotenv";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=plano_ideal",
  ssl: { rejectUnauthorized: false },
});

const users = await pool.query(
  `SELECT id, username, full_name, role FROM internal_users WHERE full_name ILIKE '%julia%' OR username ILIKE '%julia%'`
);
console.log("users:", users.rows);

for (const user of users.rows) {
  const started = Date.now();
  const credit = await pool.query(
    `SELECT COUNT(*)::int AS total FROM credit_consultations WHERE requested_by = $1`,
    [user.id]
  );
  console.log(`credit count ${user.full_name}:`, credit.rows[0].total, `${Date.now() - started}ms`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t0 = Date.now();
    await client.query(`DELETE FROM internal_users WHERE id = $1`, [user.id]);
    console.log("DELETE would run - rolling back", Date.now() - t0, "ms");
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    console.log("DELETE error:", error.message, error.code);
  } finally {
    client.release();
  }
}

const locks = await pool.query(`
  SELECT pid, state, wait_event_type, wait_event, left(query, 120) AS query
  FROM pg_stat_activity
  WHERE datname = current_database() AND state != 'idle'
  ORDER BY query_start
`);
console.log("active queries:", locks.rows);

await pool.end();
