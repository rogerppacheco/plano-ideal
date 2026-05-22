import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { createPool } from "../db.js";
import { ensureCoverageDedupSchema } from "../initSchema.js";
import { importCsvFileStreaming } from "../services/csvImport.js";
import {
  registerImportJobFiles,
  setDetectedOperator,
  updateImportJobFileStats,
} from "../services/importJobService.js";
import { insertCoverageRecord } from "../services/coverageUpsert.js";
import {
  mapRowsToCoverageRecords,
  parseWorkbookRows,
  sniffOperatorFromRow,
} from "../services/importService.js";

const INSERT_PROGRESS_EVERY = 500;

function logJob(jobId, message) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[import-job ${jobId}] ${ts} ${message}`);
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
    logJob(jobId, "Iniciando worker de importação.");
    await pool.query(
      `
        UPDATE import_jobs
        SET status = 'processing',
            started_at = NOW()
        WHERE id = $1
      `,
      [jobId]
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
    });

    for (const file of files) {
      const { path: filePath, originalname } = file;
      logJob(jobId, `Lendo do disco: ${originalname}`);

      await setJobStep(pool, jobId, `Lendo arquivo: ${originalname}…`);

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

      const buffer = fs.readFileSync(filePath);
      const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);
      logJob(jobId, `Arquivo lido: ${sizeMb} MB. Iniciando parse (etapa mais lenta em CSVs grandes).`);

      await setJobStep(
        pool,
        jobId,
        `Arquivo em memória (${sizeMb} MB). Parseando planilha — pode levar vários minutos sem mudar o contador de linhas…`,
        buffer.length
      );

      const parsedSheets = parseWorkbookRows(buffer, originalname);
      const firstLen = parsedSheets[0]?.rows?.length ?? 0;
      logJob(
        jobId,
        `Parse concluído. ${parsedSheets.length} aba(s), primeira aba com ${firstLen} linhas (aprox.).`
      );

      for (const sheet of parsedSheets) {
        await setJobStep(
          pool,
          jobId,
          `Processando aba "${sheet.sheetName || "Planilha"}": ${sheet.rows.length.toLocaleString("pt-BR")} linhas detectadas.`
        );

        if (sheet.rows[0]) {
          await setDetectedOperator(pool, jobId, sniffOperatorFromRow(sheet.rows[0]));
        }

        const mapped = mapRowsToCoverageRecords({
          rows: sheet.rows,
          operator,
          sourceFile: sheet.sourceFile,
          sheetName: sheet.sheetName,
          importJobId: jobId,
        });

        totalRows += sheet.rows.length;
        importedRows += mapped.imported;
        ignoredRows += mapped.ignored;

        await updateJobProgress(pool, {
          jobId,
          totalRows,
          processedRows,
          importedRows,
          ignoredRows,
        });
        logJob(
          jobId,
          `Aba processada: total_rows=${totalRows}, válidas acumuladas=${importedRows}, ignoradas=${ignoredRows}. Inserindo no banco…`
        );

        let insertedInSheet = 0;
        const totalInSheet = mapped.records.length;

        for (const record of mapped.records) {
          await insertCoverageRecord(pool, record, userId);
          insertedInSheet += 1;
          processedRows += 1;

          if (insertedInSheet % INSERT_PROGRESS_EVERY === 0 || insertedInSheet === totalInSheet) {
            await setJobStep(
              pool,
              jobId,
              `Inserindo no banco: ${insertedInSheet.toLocaleString("pt-BR")} / ${totalInSheet.toLocaleString("pt-BR")} (aba "${sheet.sheetName || "—"}")…`
            );
            await updateJobProgress(pool, {
              jobId,
              totalRows,
              processedRows,
              importedRows,
              ignoredRows,
            });
          }
        }

        await updateJobProgress(pool, {
          jobId,
          totalRows,
          processedRows,
          importedRows,
          ignoredRows,
        });

        await updateImportJobFileStats(pool, jobId, sheet.sourceFile, {
          importedRows: mapped.imported,
          ignoredRows: mapped.ignored,
        });
      }
    }

    await setJobStep(pool, jobId, "Salvando status final no banco (quase pronto)…");

    const completedResult = await pool.query(
      `
        UPDATE import_jobs
        SET status = 'completed',
            finished_at = NOW(),
            total_rows = $2,
            processed_rows = $3,
            imported_rows = $4,
            ignored_rows = $5,
            error_message = NULL,
            current_step = 'Importação concluída.',
            heartbeat_at = NOW()
        WHERE id = $1
      `,
      [jobId, totalRows, processedRows, importedRows, ignoredRows]
    );
    logJob(
      jobId,
      `Concluído no banco (rows afetadas=${completedResult.rowCount}). total_rows=${totalRows} processed=${processedRows} imported=${importedRows} ignored=${ignoredRows}`
    );
  } catch (error) {
    logJob(jobId, `Erro: ${error?.message || error}`);
    await pool.query(
      `
        UPDATE import_jobs
        SET status = 'failed',
            finished_at = NOW(),
            error_message = $2,
            current_step = 'Falha na importação.',
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

async function updateJobProgress(pool, { jobId, totalRows, processedRows, importedRows, ignoredRows }) {
  await pool.query(
    `
      UPDATE import_jobs
      SET total_rows = $2,
          processed_rows = $3,
          imported_rows = $4,
          ignored_rows = $5,
          heartbeat_at = NOW()
      WHERE id = $1
    `,
    [jobId, totalRows, processedRows, importedRows, ignoredRows]
  );
}

run()
  .then(() => {
    parentPort?.postMessage({ ok: true });
  })
  .catch((error) => {
    parentPort?.postMessage({ ok: false, message: error?.message });
    process.exit(1);
  });
