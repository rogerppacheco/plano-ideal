import fs from "node:fs";
import pg from "../backend/node_modules/pg/lib/index.js";

for (const line of fs.readFileSync(".env.railway", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[t.slice(0, eq).trim()] = v;
}

const jobs = [
  { label: "retry-3", document: "05623705600", numeroOs: "10272854" },
  { label: "retry-4", document: "05623705600", numeroOs: "10291026" },
  { label: "retry-5", document: "05623705600", numeroOs: "10291026" },
];

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pool.query("set search_path to plano_ideal");

const admin = await pool.query(`SELECT id FROM internal_users WHERE username = 'admin' LIMIT 1`);
const adminId = admin.rows[0]?.id;
if (!adminId) throw new Error("admin não encontrado");

const created = [];
for (const job of jobs) {
  const result = await pool.query(
    `
      INSERT INTO os_consultations (requested_by, document, numero_os_filtro, status, source)
      VALUES ($1, $2, $3, 'queued', 'internal')
      RETURNING id, document, numero_os_filtro, status, created_at
    `,
    [adminId, job.document, job.numeroOs]
  );
  created.push({ ...job, id: result.rows[0].id });
  console.log(`Enfileirada consulta #${result.rows[0].id} (${job.label})`);
}

async function pollOne(id) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const { rows } = await pool.query(
      `
        SELECT id, status, result_summary,
               length(screenshot_base64) AS screenshot_len,
               duration_seconds, error_message
        FROM os_consultations
        WHERE id = $1
      `,
      [id]
    );
    const row = rows[0];
    if (!row) return null;
    if (row.status === "success" || row.status === "failed") {
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { id, status: "timeout" };
}

for (const job of created) {
  console.log(`Aguardando consulta #${job.id} (${job.label})...`);
  const result = await pollOne(job.id);
  console.log(JSON.stringify(result, null, 2));
}

await pool.end();
