import { parentPort, workerData } from "node:worker_threads";
import { createPool } from "../db.js";
import { ensureCoverageDedupSchema } from "../initSchema.js";
import { importCsvFileStreaming } from "../services/csvImport.js";
import { importXlsxFileStreaming } from "../services/xlsxStreamImport.js";
import { registerImportJobFiles } from "../services/importJobService.js";
import {
  PHASE,
  setProgressPhase,
  updateJobProgress,
} from "../services/importJobProgress.js";

function logJob(jobId, message) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[import-job ${jobId}] ${ts} ${message}`);
}

async function markJobCompleted({
  databaseUrl,
  jobId,
  totalRows,
  processedRows,
  importedRows,
  ignoredRows,
  pool,
  logJob,
}) {
  await setProgressPhase(pool, jobId, PHASE.FINALIZING, "Salvando status final no banco (quase pronto)…");

  const sql = `
    UPDATE import_jobs
    SET status = 'completed',
        finished_at = NOW(),
        total_rows = $2,
        processed_rows = $3,
        imported_rows = $4,
        ignored_rows = $5,
        error_message = NULL,
        current_step = 'Importação concluída.',
        progress_phase = NULL,
        heartbeat_at = NOW()
    WHERE id = $1
  `;
  const params = [jobId, totalRows, processedRows, importedRows, ignoredRows];

  let completedResult;
  try {
    completedResult = await pool.query(sql, params);
  } catch (firstError) {
    logJob(jobId, `Retry conclusão com conexão nova: ${firstError?.message || firstError}`);
    const freshPool = createPool(databaseUrl);
    try {
      completedResult = await freshPool.query(sql, params);
    } finally {
      await freshPool.end();
    }
  }

  logJob(
    jobId,
    `Concluído no banco (rows afetadas=${completedResult.rowCount}). total_rows=${totalRows} processed=${processedRows} imported=${importedRows} ignored=${ignoredRows}`
  );
}

async function setJobStep(pool, jobId, step, fileBytesRead = null) {
  if (fileBytesRead != null) {
    await pool.query(
      `
        UPDATE import_jobs
        SET current_step = $2,
            file_bytes_read = $3,
            heartbeat_at = NOW()
        WHERE id = $1
      `,
      [jobId, step, fileBytesRead]
    );
  } else {
    await pool.query(
      `
        UPDATE import_jobs
        SET current_step = $2,
            heartbeat_at = NOW()
        WHERE id = $1
      `,
      [jobId, step]
    );
  }
}

async function run() {
  const { jobId, operator, userId, files, databaseUrl } = workerData;
  const pool = createPool(databaseUrl);

  try {
    logJob(jobId, "Garantindo migração de dedup/índice (necessário para upsert)…");
    await ensureCoverageDedupSchema(pool);
    await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS progress_phase TEXT;`);
    logJob(jobId, "Iniciando worker de importação.");
    await pool.query(
      `
        UPDATE import_jobs
        SET status = 'processing',
            started_at = NOW(),
            progress_phase = $2,
            heartbeat_at = NOW()
        WHERE id = $1
      `,
      [jobId, PHASE.READING]
    );

    await setJobStep(pool, jobId, "Preparando arquivos…");
    await registerImportJobFiles(pool, jobId, files);

    let totalRows = 0;
    let processedRows = 0;
    let importedRows = 0;
    let ignoredRows = 0;

    await updateJobProgress(pool, {
      jobId,
      totalRows,
      processedRows,
      importedRows,
      ignoredRows,
      phase: PHASE.QUEUED,
    });

    for (const file of files) {
      const { path: filePath, originalname } = file;
      logJob(jobId, `Lendo do disco: ${originalname}`);

      await setProgressPhase(pool, jobId, PHASE.READING, `Lendo arquivo: ${originalname}…`);

      const isCsv = originalname.toLowerCase().endsWith(".csv");

      if (isCsv) {
        const csvStats = await importCsvFileStreaming({
          filePath,
          originalName: originalname,
          operator,
          userId,
          pool,
          jobId,
          setJobStep,
          updateJobProgress,
          logJob,
          baseTotals: {
            totalRows,
            processedRows,
            importedRows,
            ignoredRows,
          },
        });
        totalRows += csvStats.scannedLines;
        processedRows += csvStats.processedInserts;
        importedRows += csvStats.importedRows;
        ignoredRows += csvStats.ignoredRows;
        continue;
      }

      const xlsxStats = await importXlsxFileStreaming({
        filePath,
        originalName: originalname,
        operator,
        userId,
        pool,
        jobId,
        setJobStep,
        updateJobProgress,
        logJob,
        baseTotals: {
          totalRows,
          processedRows,
          importedRows,
          ignoredRows,
        },
      });
      totalRows += xlsxStats.scannedLines;
      processedRows += xlsxStats.processedInserts;
      importedRows += xlsxStats.importedRows;
      ignoredRows += xlsxStats.ignoredRows;
    }

    await markJobCompleted({
      databaseUrl,
      jobId,
      totalRows,
      processedRows,
      importedRows,
      ignoredRows,
      pool,
      logJob,
    });
  } catch (error) {
    logJob(jobId, `Erro: ${error?.message || error}`);
    await pool.query(
      `
        UPDATE import_jobs
        SET status = 'failed',
            finished_at = NOW(),
            error_message = $2,
            current_step = 'Falha na importação.',
            progress_phase = NULL,
            heartbeat_at = NOW()
        WHERE id = $1
      `,
      [jobId, String(error?.message || "Falha inesperada durante importação.")]
    );
    throw error;
  } finally {
    await pool.end();
  }
}

run()
  .then(() => {
    parentPort?.postMessage({ ok: true });
  })
  .catch((error) => {
    parentPort?.postMessage({ ok: false, message: error?.message });
    process.exit(1);
  });
