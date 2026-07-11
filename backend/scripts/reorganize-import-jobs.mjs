/**
 * Remove jobs de importação incorretos e renumera os jobs válidos.
 *
 * Uso (produção):
 *   cd comparador-leads/backend
 *   $env:CONFIRM_REORGANIZE = "SIM"
 *   node ./scripts/reorganize-import-jobs.mjs
 *
 * Padrão deste script:
 *   - Apaga jobs 205–210 (e arquivos vinculados)
 *   - Renumerar 211 -> 205 e 212 -> 206
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, getDbSchema } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const REMOVE_IDS = [205, 206, 207, 208, 209, 210];
const RENUMBER_MAP = [
  [211, 205],
  [212, 206],
];

function describeUrl(url = "") {
  try {
    const u = new URL(url.replace(/^postgresql:/, "postgres:"));
    const isLocal = /localhost|127\.0\.0\.1/i.test(u.hostname || "");
    return { isLocal, host: u.hostname, database: u.pathname.replace(/^\//, "") };
  } catch {
    return { isLocal: true, host: "?", database: "?" };
  }
}

async function listJobs(pool, ids) {
  const { rows } = await pool.query(
    `
      SELECT j.id, j.operator, j.status, j.reverted_at, j.imported_rows,
             COALESCE(
               (SELECT json_agg(f.file_name ORDER BY f.id)
                FROM import_job_files f WHERE f.job_id = j.id),
               '[]'::json
             ) AS files
      FROM import_jobs j
      WHERE j.id = ANY($1::bigint[])
      ORDER BY j.id
    `,
    [ids]
  );
  return rows;
}

async function countCoverageForJobs(pool, ids) {
  const { rows } = await pool.query(
    `SELECT import_job_id AS job_id, COUNT(*)::int AS total
     FROM coverage_records
     WHERE import_job_id = ANY($1::bigint[])
     GROUP BY import_job_id
     ORDER BY import_job_id`,
    [ids]
  );
  return rows;
}

async function deleteJobs(pool, ids) {
  const coverage = await pool.query(
    `DELETE FROM coverage_records WHERE import_job_id = ANY($1::bigint[])`,
    [ids]
  );
  const files = await pool.query(`DELETE FROM import_job_files WHERE job_id = ANY($1::bigint[])`, [
    ids,
  ]);
  const jobs = await pool.query(`DELETE FROM import_jobs WHERE id = ANY($1::bigint[])`, [ids]);
  return {
    coverage: coverage.rowCount ?? 0,
    files: files.rowCount ?? 0,
    jobs: jobs.rowCount ?? 0,
  };
}

const JOB_DATA_COLS = `
  operator, status, created_by, created_at, started_at, finished_at,
  total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
  current_step, file_bytes_read, heartbeat_at, progress_phase, detected_operator,
  reverted_at, records_deleted
`.trim();

/** Clona job + filhos para um novo id e remove o original (FK exige id pai existente). */
async function moveJobId(pool, fromId, newId) {
  const { rowCount } = await pool.query(
    `
      INSERT INTO import_jobs (id, ${JOB_DATA_COLS})
      SELECT $2, ${JOB_DATA_COLS}
      FROM import_jobs WHERE id = $1
    `,
    [fromId, newId]
  );
  if (!rowCount) {
    throw new Error(`Job #${fromId} não encontrado para mover -> #${newId}`);
  }
  await pool.query(`UPDATE import_job_files SET job_id = $2 WHERE job_id = $1`, [fromId, newId]);
  await pool.query(`UPDATE coverage_records SET import_job_id = $2 WHERE import_job_id = $1`, [
    fromId,
    newId,
  ]);
  await pool.query(`DELETE FROM import_jobs WHERE id = $1`, [fromId]);
}

async function renumberJob(pool, fromId, toId) {
  const tempId = 9_000_000 + fromId;
  await moveJobId(pool, fromId, tempId);
  await moveJobId(pool, tempId, toId);
}

async function resetSequence(pool, schema) {
  await pool.query(
    `
      SELECT setval(
        pg_get_serial_sequence($1, 'id'),
        COALESCE((SELECT MAX(id) FROM import_jobs), 1),
        true
      )
    `,
    [`${schema}.import_jobs`]
  );
}

async function run() {
  if (process.env.CONFIRM_REORGANIZE !== "SIM") {
    console.error(`
Confirmação obrigatória.

No PowerShell:
  $env:CONFIRM_REORGANIZE = "SIM"
  node ./scripts/reorganize-import-jobs.mjs
`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ausente. Preencha comparador-leads/.env.railway");
    process.exit(1);
  }

  const schema = getDbSchema();
  const conn = describeUrl(process.env.DATABASE_URL);
  const pool = createPool();

  console.log(`\n=== Reorganizar import_jobs (${schema}) ===\n`);
  console.log(`Host: ${conn.host} | Banco: ${conn.database}`);
  if (conn.isLocal && process.env.ALLOW_LOCAL_REORGANIZE !== "SIM") {
    console.error("\nBloqueado em localhost. Use ALLOW_LOCAL_REORGANIZE=SIM se for intencional.\n");
    process.exit(1);
  }

  await pool.query(`SET search_path TO ${schema}`);

  const allIds = [...REMOVE_IDS, ...RENUMBER_MAP.map(([from]) => from)];
  console.log("Estado atual:");
  for (const row of await listJobs(pool, allIds)) {
    const files = Array.isArray(row.files) ? row.files.join(", ") : "";
    const rev = row.reverted_at ? " [REMOVIDA]" : "";
    console.log(
      `  #${row.id} ${row.operator} | ${row.status}${rev} | válidas ${row.imported_rows} | ${files}`
    );
  }

  const covBefore = await countCoverageForJobs(pool, allIds);
  if (covBefore.length) {
    console.log("\nRegistros de cobertura ainda vinculados:");
    for (const row of covBefore) {
      console.log(`  job #${row.job_id}: ${row.total}`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("\n1) Removendo jobs incorretos 205–210…");
    const deleted = await deleteJobs(client, REMOVE_IDS);
    console.log(`   coverage=${deleted.coverage} | files=${deleted.files} | jobs=${deleted.jobs}`);

    console.log("\n2) Renumerando jobs válidos…");
    for (const [fromId, toId] of RENUMBER_MAP) {
      const exists = await client.query(`SELECT id FROM import_jobs WHERE id = $1`, [fromId]);
      if (!exists.rows[0]) {
        console.log(`   SKIP #${fromId} -> #${toId} (job de origem não existe)`);
        continue;
      }
      const targetBusy = await client.query(`SELECT id FROM import_jobs WHERE id = $1`, [toId]);
      if (targetBusy.rows[0]) {
        throw new Error(`ID destino #${toId} ainda existe. Abortando.`);
      }
      await renumberJob(client, fromId, toId);
      console.log(`   #${fromId} -> #${toId}`);
    }

    await resetSequence(client, schema);
    await client.query("COMMIT");
    console.log("\nConcluído com sucesso.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\nFALHA — nada foi gravado:", error?.message || error);
    process.exitCode = 1;
  } finally {
    client.release();
  }

  console.log("\nEstado final:");
  const finalIds = [204, 205, 206];
  for (const row of await listJobs(pool, finalIds)) {
    const files = Array.isArray(row.files) ? row.files.join(", ") : "";
    const rev = row.reverted_at ? " [REMOVIDA]" : "";
    console.log(
      `  #${row.id} ${row.operator} | ${row.status}${rev} | válidas ${row.imported_rows} | ${files}`
    );
  }

  const seq = await pool.query(`SELECT last_value FROM ${schema}.import_jobs_id_seq`);
  console.log(`\nPróximo ID (sequence): ${Number(seq.rows[0]?.last_value || 0) + 1}`);

  await pool.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
