import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import pg from "pg";
import { mapRowsToCoverageRecords, parseWorkbookRows } from "../services/importService.js";

const { Pool } = pg;

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
  const pool = new Pool({ connectionString: databaseUrl });

  try {
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

        const mapped = mapRowsToCoverageRecords({
          rows: sheet.rows,
          operator,
          sourceFile: sheet.sourceFile,
          sheetName: sheet.sheetName,
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
          await pool.query(
            `
              INSERT INTO coverage_records
              (cep_digits, operator, source_file, sheet_name, row_data, imported_by)
              VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            `,
            [
              record.cepDigits,
              record.operator,
              record.sourceFile,
              record.sheetName,
              JSON.stringify(record.rowData),
              userId,
            ]
          );
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
      }
    }

    await pool.query(
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
    logJob(jobId, `Concluído. total_rows=${totalRows} processed=${processedRows} imported=${importedRows} ignored=${ignoredRows}`);
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
