import { createPool } from "../db.js";
import { ensureCoverageDedupSchema } from "../initSchema.js";
import { importCsvFileStreaming } from "./csvImport.js";
import { importXlsxFile } from "./xlsxImport.js";
import { registerImportJobFiles } from "./importJobService.js";
import { PHASE, setProgressPhase, updateJobProgress } from "./importJobProgress.js";

export function createJobLogger(jobId) {
  return (first, second) => {
    const message = second !== undefined ? second : first;
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`[import-job ${jobId}] ${ts} ${message}`);
  };
}

export async function setJobStep(pool, jobId, step, fileBytesRead = null) {
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

export async function markJobCompleted({
  databaseUrl,
  pool,
  jobId,
  totalRows,
  processedRows,
  importedRows,
  ignoredRows,
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

export async function markJobFailed(pool, jobId, message, logJob) {
  logJob(`Erro: ${message}`);
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
    [jobId, String(message || "Falha inesperada durante importação.")]
  );
}

/**
 * Processa arquivos de um job (mesma lógica do worker HTTP).
 */
export async function runImportJobFiles({
  pool,
  databaseUrl,
  jobId,
  operator,
  userId,
  files,
  logJob = createJobLogger(jobId),
}) {
  await ensureCoverageDedupSchema(pool);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS progress_phase TEXT;`);

  logJob(jobId, "Iniciando processamento.");
  await pool.query(
    `
      UPDATE import_jobs
      SET status = 'processing',
          started_at = COALESCE(started_at, NOW()),
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
    const filePath = file.path;
    const originalname = file.originalname || file.file_name;

    logJob(jobId, `Lendo do disco: ${originalname}`);
    await setProgressPhase(pool, jobId, PHASE.READING, `Lendo arquivo: ${originalname}…`);

    const isCsv = originalname.toLowerCase().endsWith(".csv");
    const importCtx = {
      filePath,
      originalName: originalname,
      operator,
      userId,
      pool,
      jobId,
      setJobStep,
      updateJobProgress,
      logJob,
      baseTotals: { totalRows, processedRows, importedRows, ignoredRows },
    };

    const stats = isCsv ? await importCsvFileStreaming(importCtx) : await importXlsxFile(importCtx);

    totalRows += stats.scannedLines;
    processedRows += stats.processedInserts;
    importedRows += stats.importedRows;
    ignoredRows += stats.ignoredRows;
  }

  await markJobCompleted({
    databaseUrl,
    pool,
    jobId,
    totalRows,
    processedRows,
    importedRows,
    ignoredRows,
    logJob,
  });

  return { totalRows, processedRows, importedRows, ignoredRows };
}
