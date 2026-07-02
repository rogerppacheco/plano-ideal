import fs from "fs";
import pg from "pg";

const envPath = new URL("../../.env.railway", import.meta.url);
const envText = fs.readFileSync(envPath, "utf8");
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

const consultations = await pool.query(`
  SELECT id, document, status, error_message, attempts, created_at, started_at, finished_at
  FROM credit_consultations
  ORDER BY id DESC
  LIMIT 5
`);
console.log("consultations:", JSON.stringify(consultations.rows, null, 2));

const creds = await pool.query(
  "SELECT id, label, enabled, in_use_by, locked_at FROM pap_bo_credentials"
);
console.log("credentials:", JSON.stringify(creds.rows, null, 2));

const tts = await pool.query("SELECT id, matricula, enabled FROM pap_tt_matriculas");
console.log("tts:", JSON.stringify(tts.rows, null, 2));

await pool.end();
