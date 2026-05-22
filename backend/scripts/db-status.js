/**
 * Resumo do banco online (schema plano_ideal).
 * Uso: node ./scripts/db-status.js
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, getDbSchema } from "../src/db.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

function describeDatabaseUrl(url = process.env.DATABASE_URL || "") {
  try {
    const u = new URL(url.replace(/^postgresql:/, "postgres:"));
    const host = u.hostname || "?";
    const isLocal = /localhost|127\.0\.0\.1/i.test(host);
    return { label: isLocal ? "LOCAL" : "REMOTO (Railway)", database: u.pathname.replace(/^\//, "") || "?", host };
  } catch {
    return { label: "?", database: "?", host: "?" };
  }
}

const pool = createPool();

function formatTs(v) {
  if (!v) return "—";
  try {
    return new Date(v).toISOString().slice(0, 19).replace("T", " ");
  } catch {
    return String(v);
  }
}

async function run() {
  const schema = getDbSchema();
  const conn = describeDatabaseUrl();
  console.log(`\n=== Banco Plano Ideal (schema: ${schema}) ===\n`);
  console.log(`Conexão: ${conn.label} | host ${conn.host} | banco ${conn.database}`);
  if (conn.label === "LOCAL") {
    console.log(
      "Dica: para o Railway, preencha comparador-leads/.env.railway com DATABASE_URL (ele tem prioridade sobre backend/.env)."
    );
  }

  const meta = await pool.query(`
    SELECT current_database() AS db, current_user AS usr, version() AS version
  `);
  console.log("\nBanco conectado:", meta.rows[0].db);
  console.log("Versão:", meta.rows[0].version.split("\n")[0]);

  const tables = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `, [schema]);
  console.log(`\nTabelas em ${schema}:`, tables.rows.map((r) => r.table_name).join(", ") || "(nenhuma)");

  if (tables.rows.length === 0) {
    const inPublic = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('internal_users', 'coverage_records', 'import_jobs')
    `);
    if (inPublic.rows.length > 0) {
      console.log(
        `\nATENÇÃO: existem tabelas em public (${inPublic.rows.map((r) => r.table_name).join(", ")}), mas o app usa schema "${schema}".`
      );
      console.log("Rode: npm run setup-schema   (local) ou aponte DATABASE_URL para o Railway.");
      await pool.end();
      return;
    }
  }

  const users = await pool.query(`
    SELECT id, username, role, full_name, created_at
    FROM internal_users
    ORDER BY id
  `);
  console.log("\n--- Usuários internos ---");
  for (const u of users.rows) {
    console.log(`  ${u.id} | ${u.username} | ${u.role} | ${u.full_name}`);
  }

  const coverage = await pool.query(`
    SELECT operator, COUNT(*)::INT AS total
    FROM coverage_records
    GROUP BY operator
    ORDER BY operator
  `);
  console.log("\n--- Cobertura (coverage_records) ---");
  let covTotal = 0;
  for (const r of coverage.rows) {
    console.log(`  ${r.operator}: ${r.total.toLocaleString("pt-BR")} linhas`);
    covTotal += r.total;
  }
  console.log(`  TOTAL: ${covTotal.toLocaleString("pt-BR")}`);

  const hasJobCol = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'coverage_records' AND column_name = 'import_job_id'
    ) AS ok
  `, [schema]);

  if (hasJobCol.rows[0].ok) {
    const byJob = await pool.query(`
      SELECT import_job_id, COUNT(*)::INT AS total
      FROM coverage_records
      WHERE import_job_id IS NOT NULL
      GROUP BY import_job_id
      ORDER BY import_job_id
    `);
    if (byJob.rows.length) {
      console.log("\n--- Por import_job_id ---");
      for (const r of byJob.rows) {
        console.log(`  job #${r.import_job_id}: ${r.total.toLocaleString("pt-BR")}`);
      }
    }
    const withoutJob = await pool.query(`
      SELECT COUNT(*)::INT AS total FROM coverage_records WHERE import_job_id IS NULL
    `);
    if (withoutJob.rows[0].total > 0) {
      console.log(`  sem job_id (legado): ${withoutJob.rows[0].total.toLocaleString("pt-BR")}`);
    }
  }

  const files = await pool.query(`
    SELECT operator, source_file, COUNT(*)::INT AS total
    FROM coverage_records
    GROUP BY operator, source_file
    ORDER BY total DESC
    LIMIT 15
  `);
  console.log("\n--- Top arquivos (source_file) ---");
  for (const r of files.rows) {
    console.log(`  ${r.operator} | ${r.source_file} | ${r.total.toLocaleString("pt-BR")}`);
  }

  const hasJobFiles = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = 'import_job_files'
    ) AS ok
  `, [schema]);

  const jobCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'import_jobs'
  `, [schema]);
  const jobColSet = new Set(jobCols.rows.map((r) => r.column_name));
  const extra = ["detected_operator", "reverted_at", "records_deleted"]
    .filter((c) => jobColSet.has(c))
    .map((c) => `j.${c}`)
    .join(", ");

  const jobs = await pool.query(`
    SELECT j.id, j.operator, j.status, j.imported_rows, j.ignored_rows,
           j.created_at, j.finished_at, j.total_files, j.error_message
           ${extra ? `, ${extra}` : ""}
    FROM import_jobs j
    ORDER BY j.id DESC
    LIMIT 20
  `);
  console.log("\n--- Últimas importações (import_jobs) ---");
  for (const j of jobs.rows) {
    const rev = j.reverted_at ? " [REMOVIDA]" : "";
    const mismatch =
      j.detected_operator && j.operator !== j.detected_operator
        ? ` ⚠ arquivo~${j.detected_operator}`
        : "";
    console.log(
      `  #${j.id} | ${j.operator}${mismatch} | ${j.status}${rev} | válidas ${Number(j.imported_rows ?? 0).toLocaleString("pt-BR")} | ${formatTs(j.created_at)}`
    );
    if (hasJobFiles.rows[0].ok) {
      const jobFiles = await pool.query(
        `SELECT file_name, file_size_bytes, rows_imported FROM import_job_files WHERE job_id = $1`,
        [j.id]
      );
      for (const f of jobFiles.rows) {
        const mb = f.file_size_bytes ? ` ${(f.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : "";
        console.log(`      → ${f.file_name}${mb}`);
      }
    }
  }

  console.log("");
  await pool.end();
}

run().catch(async (e) => {
  console.error("Erro:", e.message);
  console.error("\nDica: crie comparador-leads/.env.railway com DATABASE_URL (veja .env.railway.example)\n");
  await pool.end();
  process.exit(1);
});
