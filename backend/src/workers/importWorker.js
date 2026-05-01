import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import pg from "pg";
import { mapRowsToCoverageRecords, parseWorkbookRows } from "../services/importService.js";

const { Pool } = pg;

async function run() {
  const { jobId, operator, userId, files, databaseUrl } = workerData;
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(
      `
        UPDATE import_jobs
        SET status = 'processing',
            started_at = NOW()
        WHERE id = $1
      `,
      [jobId]
    );

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
      const buffer = fs.readFileSync(file.path);
      const parsedSheets = parseWorkbookRows(buffer, file.originalname);

      for (const sheet of parsedSheets) {
        const mapped = mapRowsToCoverageRecords({
          rows: sheet.rows,
          operator,
          sourceFile: sheet.sourceFile,
          sheetName: sheet.sheetName,
        });

        totalRows += sheet.rows.length;
        importedRows += mapped.imported;
        ignoredRows += mapped.ignored;
        processedRows += sheet.rows.length;

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
            error_message = NULL
        WHERE id = $1
      `,
      [jobId, totalRows, processedRows, importedRows, ignoredRows]
    );
  } catch (error) {
    await pool.query(
      `
        UPDATE import_jobs
        SET status = 'failed',
            finished_at = NOW(),
            error_message = $2
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
          ignored_rows = $5
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
