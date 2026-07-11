import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";
import { validateDocument } from "../src/utils/documentValidation.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = path.join(root, ".env.railway");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=plano_ideal",
});

const document = process.argv[2] || "05623705600";

const validation = validateDocument(document);
console.log("validation:", validation);

try {
  const admin = await pool.query(
    `SELECT id, username FROM internal_users WHERE username = 'admin'`
  );
  const userId = admin.rows[0]?.id;
  console.log("admin:", admin.rows[0]);

  const bo = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pap_bo_credentials
      WHERE enabled = true AND in_use_by IS NULL
    ) AS ok
  `);
  console.log("bo:", bo.rows[0]?.ok);

  const insertQuery = `
    INSERT INTO credit_consultations (requested_by, document, cpf_representative, status)
    VALUES ($1, $2, $3, 'queued')
    RETURNING id, document, cpf_representative, status, created_at
  `;
  const { rows } = await pool.query(insertQuery, [
    userId,
    validation.document,
    validation.cpfRepresentative,
  ]);
  console.log("insert:", rows[0]);
} catch (error) {
  console.error("ERROR:", error.message);
  console.error(error);
}

await pool.end();
