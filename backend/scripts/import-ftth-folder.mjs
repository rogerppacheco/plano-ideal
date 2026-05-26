/**
 * Importa em massa uma pasta de .xlsx FTTH (ex.: 147 bases Vivo) direto no Postgres de produção.
 *
 * Pré-requisitos:
 *   comparador-leads/.env.railway com DATABASE_URL (Railway)
 *
 * Uso:
 *   cd comparador-leads/backend
 *   node ./scripts/import-ftth-folder.mjs "C:\caminho\Endereços FTTH"
 *
 * Opções:
 *   --operator Vivo          (padrão: Vivo)
 *   --skip-existing          pula arquivos já importados com sucesso
 *   --retry-failed           só arquivos sem job completed (falhou ou nunca rodou)
 *   --from AL.xlsx             retoma a partir deste arquivo (ordem alfabética)
 *   --files A.xlsx,B.xlsx    processa somente arquivos informados
 *   --limit 5                processa só N arquivos (teste)
 *   --dry-run                só lista o que seria importado
 *   --force                  ignora outro job em processing no banco
 *   --batch-size 500         registros por INSERT em lote (padrão: 500 ou IMPORT_BATCH_SIZE)
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../src/db.js";
import { ensureSchema } from "../src/initSchema.js";
import { validateImportFile } from "../src/config/importLimits.js";
import {
  createJobLogger,
  markJobFailed,
  runImportJobFiles,
} from "../src/services/importJobRunner.js";
import { recoverStuckJob } from "../src/services/importJobRecovery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

function parseArgs(argv) {
  const opts = {
    folder: null,
    operator: "Vivo",
    skipExisting: false,
    retryFailed: false,
    from: null,
    limit: null,
    dryRun: false,
    force: false,
    batchSize: null,
    files: null,
    extraPositionals: [],
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--operator" && argv[i + 1]) {
      opts.operator = argv[++i];
    } else if (a === "--skip-existing") {
      opts.skipExisting = true;
    } else if (a === "--retry-failed") {
      opts.retryFailed = true;
      opts.skipExisting = true;
    } else if (a === "--from" && argv[i + 1]) {
      opts.from = argv[++i];
    } else if (a === "--limit" && argv[i + 1]) {
      opts.limit = Number(argv[++i]);
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--force") {
      opts.force = true;
    } else if (a === "--batch-size" && argv[i + 1]) {
      opts.batchSize = Number(argv[++i]);
    } else if (a === "--files" && argv[i + 1]) {
      opts.files = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (!a.startsWith("--")) {
      if (!opts.folder) {
        opts.folder = a;
      } else {
        opts.extraPositionals.push(a);
      }
    }
  }
  // Fallback: alguns shells/npm podem "sumir" com --files e deixar apenas argumento posicional.
  if (!opts.files?.length && opts.extraPositionals.length > 0) {
    const joined = opts.extraPositionals.join(",");
    opts.files = joined.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return opts;
}

async function getAdminUserId(pool) {
  const r = await pool.query(
    `SELECT id FROM internal_users WHERE role = 'admin' ORDER BY id LIMIT 1`
  );
  if (!r.rows[0]) {
    throw new Error("Nenhum usuário admin no banco. Rode seed-users ou crie um admin.");
  }
  return r.rows[0].id;
}

async function isFileAlreadyImported(pool, fileName, operator) {
  const r = await pool.query(
    `
      SELECT j.id
      FROM import_jobs j
      INNER JOIN import_job_files f ON f.job_id = j.id AND f.file_name = $1
      WHERE j.status = 'completed'
        AND j.operator = $2
        AND j.reverted_at IS NULL
      LIMIT 1
    `,
    [fileName, operator]
  );
  return Boolean(r.rows[0]);
}

async function failStaleProcessingJobs(pool) {
  const r = await pool.query(
    `
      SELECT id FROM import_jobs
      WHERE status IN ('queued', 'processing')
      ORDER BY id
    `
  );
  for (const row of r.rows) {
    await recoverStuckJob(pool, row.id);
    const check = await pool.query(`SELECT status FROM import_jobs WHERE id = $1`, [row.id]);
    if (check.rows[0]?.status === "processing" || check.rows[0]?.status === "queued") {
      await pool.query(
        `
          UPDATE import_jobs
          SET status = 'failed',
              finished_at = NOW(),
              error_message = 'Interrompido para liberar importação em massa (script FTTH).',
              progress_phase = NULL
          WHERE id = $1
        `,
        [row.id]
      );
    }
  }
}

async function createJobForFile(pool, operator, userId, filePath, fileName) {
  const stat = fs.statSync(filePath);
  const r = await pool.query(
    `
      INSERT INTO import_jobs (operator, status, created_by, total_files)
      VALUES ($1, 'queued', $2, 1)
      RETURNING id
    `,
    [operator, userId]
  );
  const jobId = r.rows[0].id;
  return {
    jobId,
    files: [
      {
        path: filePath,
        originalname: fileName,
        size: stat.size,
      },
    ],
  };
}

function listXlsxFiles(folder, filesFilter) {
  let names = fs
    .readdirSync(folder)
    .filter((f) => /\.xlsx$/i.test(f))
    .filter((f) => !f.startsWith("~$"))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  if (filesFilter?.length) {
    const wanted = new Set(filesFilter.map((f) => f.toLowerCase()));
    names = names.filter((n) => wanted.has(n.toLowerCase()));
    const missing = filesFilter.filter((f) => !names.some((n) => n.toLowerCase() === f.toLowerCase()));
    if (missing.length) {
      console.warn("Aviso: não encontrados na pasta:", missing.join(", "));
    }
  }
  return names;
}

const opts = parseArgs(process.argv);
if (!opts.folder || !fs.existsSync(opts.folder)) {
  console.error(`
Uso: node ./scripts/import-ftth-folder.mjs "<pasta Endereços FTTH>" [opções]

Exemplo:
  node ./scripts/import-ftth-folder.mjs "C:\\Users\\rogge\\Downloads\\Endereços FTTH-...\\Endereços FTTH" --operator Vivo --skip-existing

Opções: --skip-existing --retry-failed --from MG_1.xlsx --limit 3 --dry-run --force
        --files "SP_1.xlsx,SP_2.xlsx"   (só estes arquivos)
`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ausente. Preencha comparador-leads/.env.railway");
  process.exit(1);
}

if (opts.batchSize > 0) {
  process.env.IMPORT_BATCH_SIZE = String(opts.batchSize);
}

const batchSize = Number(process.env.IMPORT_BATCH_SIZE ?? 500);

const pool = createPool();
const databaseUrl = process.env.DATABASE_URL;

console.log("\n=== Importação em massa FTTH ===\n");
console.log("Pasta:", opts.folder);
console.log("Operadora:", opts.operator);
if (opts.retryFailed) {
  console.log("Modo: só arquivos pendentes (sem importação concluída)");
}
console.log("Insert em lote:", batchSize, "registros por query");
console.log("Banco:", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@"));

await ensureSchema();

if (!opts.force) {
  const busy = await pool.query(
    `SELECT id, status FROM import_jobs WHERE status IN ('queued', 'processing') LIMIT 1`
  );
  if (busy.rows[0]) {
    console.error(
      `\nJá existe job #${busy.rows[0].id} em "${busy.rows[0].status}". Aguarde ou use --force para encerrar jobs travados e continuar.\n`
    );
    await pool.end();
    process.exit(1);
  }
} else {
  console.log("--force: encerrando/recuperando jobs processing pendentes…");
  await failStaleProcessingJobs(pool);
}

const userId = await getAdminUserId(pool);

let names = listXlsxFiles(opts.folder, opts.files);

if (opts.from) {
  const idx = names.findIndex((n) => n.toLowerCase() === opts.from.toLowerCase());
  if (idx === -1) {
    console.error(`--from: arquivo não encontrado: ${opts.from}`);
    process.exit(1);
  }
  names = names.slice(idx);
}

if (opts.limit > 0) {
  names = names.slice(0, opts.limit);
}

console.log(`Arquivos na fila: ${names.length}\n`);

if (opts.dryRun) {
  for (const name of names) {
    const fp = path.join(opts.folder, name);
    const sizeMb = (fs.statSync(fp).size / 1024 / 1024).toFixed(2);
    const skip =
      opts.skipExisting && (await isFileAlreadyImported(pool, name, opts.operator));
    console.log(`${skip ? "SKIP" : "    "} ${name} (${sizeMb} MB)`);
  }
  await pool.end();
  process.exit(0);
}

const startedAt = Date.now();
let done = 0;
let skipped = 0;
let failed = 0;

for (let i = 0; i < names.length; i += 1) {
  const fileName = names[i];
  const filePath = path.join(opts.folder, fileName);
  const label = `[${i + 1}/${names.length}]`;

  if (!fs.existsSync(filePath)) {
    console.log(`${label} SKIP: ${fileName} — arquivo não encontrado (pode ter sido movido/removido).`);
    skipped += 1;
    continue;
  }

  if (opts.skipExisting && (await isFileAlreadyImported(pool, fileName, opts.operator))) {
    console.log(`${label} SKIP (já importado): ${fileName}`);
    skipped += 1;
    continue;
  }

  const check = validateImportFile({
    originalname: fileName,
    size: fs.statSync(filePath).size,
  });
  if (!check.ok) {
    console.log(`${label} SKIP: ${fileName} — ${check.message}`);
    skipped += 1;
    continue;
  }

  const { jobId, files } = await createJobForFile(pool, opts.operator, userId, filePath, fileName);
  const logJob = createJobLogger(jobId);
  console.log(`\n${label} Job #${jobId} — ${fileName}`);

  try {
    const result = await runImportJobFiles({
      pool,
      databaseUrl,
      jobId,
      operator: opts.operator,
      userId,
      files,
      logJob,
    });
    done += 1;
    console.log(
      `${label} OK #${jobId} — válidas ${result.importedRows.toLocaleString("pt-BR")}, ignoradas ${result.ignoredRows.toLocaleString("pt-BR")}`
    );
  } catch (error) {
    failed += 1;
    await markJobFailed(pool, jobId, error?.message || error, logJob);
    console.error(`${label} FALHA #${jobId}: ${error?.message || error}`);
  }
}

const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
console.log(`
=== Resumo ===
Concluídos: ${done}
Pulados:    ${skipped}
Falhas:     ${failed}
Tempo:      ${elapsedMin} min
`);

await pool.end();
