import fs from "node:fs";
import ExcelJS from "exceljs";
import { insertCoverageRecord } from "./coverageUpsert.js";
import { mapRowsToCoverageRecords, sniffOperatorFromRow } from "./importService.js";
import { PHASE, setProgressPhase } from "./importJobProgress.js";
import { setDetectedOperator, updateImportJobFileStats } from "./importJobService.js";

const BATCH_ROWS = 2500;
const PROGRESS_EVERY = 10000;

function cellToString(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value.text != null) return String(value.text);
  return String(value);
}

function rowToObject(headers, row) {
  const obj = {};
  const values = row.values || [];
  for (let i = 0; i < headers.length; i += 1) {
    const key = headers[i];
    if (!key) continue;
    obj[key] = cellToString(values[i + 1]);
  }
  return obj;
}

/**
 * Importa .xlsx em streaming (linha a linha) — evita carregar a planilha inteira na RAM.
 */
export async function importXlsxFileStreaming({
  filePath,
  originalName,
  operator,
  userId,
  pool,
  jobId,
  setJobStep,
  updateJobProgress,
  logJob,
  baseTotals = { totalRows: 0, processedRows: 0, importedRows: 0, ignoredRows: 0 },
}) {
  const stat = fs.statSync(filePath);
  const sizeMb = (stat.size / 1024 / 1024).toFixed(2);
  logJob(jobId, `XLSX ${sizeMb} MB — streaming com ExcelJS (sem parse monolítico).`);

  await setProgressPhase(
    pool,
    jobId,
    PHASE.READING,
    `Abrindo planilha (${sizeMb} MB) em modo streaming…`
  );

  let scannedLines = 0;
  let processedInserts = 0;
  let importedRows = 0;
  let ignoredRows = 0;
  let headerSniffDone = false;

  const flushBatch = async (batch, sheetName) => {
    if (batch.length === 0) return;

    const mapped = mapRowsToCoverageRecords({
      rows: batch,
      operator,
      sourceFile: originalName,
      sheetName,
      importJobId: jobId,
    });

    importedRows += mapped.imported;
    ignoredRows += mapped.ignored;

    for (const record of mapped.records) {
      await insertCoverageRecord(pool, record, userId);
      processedInserts += 1;
    }

    await updateJobProgress(pool, {
      jobId,
      totalRows: baseTotals.totalRows + scannedLines,
      processedRows: baseTotals.processedRows + processedInserts,
      importedRows: baseTotals.importedRows + importedRows,
      ignoredRows: baseTotals.ignoredRows + ignoredRows,
      phase: PHASE.INSERTING,
    });

    await setJobStep(
      pool,
      jobId,
      `Planilha: ${(baseTotals.totalRows + scannedLines).toLocaleString("pt-BR")} linhas · ${(baseTotals.processedRows + processedInserts).toLocaleString("pt-BR")} gravadas…`
    );
  };

  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

  let sheetIndex = 0;

  try {
    for await (const worksheetReader of workbook) {
      sheetIndex += 1;
      const sheetName = worksheetReader.name || `Aba ${sheetIndex}`;
      logJob(jobId, `Processando aba: ${sheetName}`);

      await setProgressPhase(
        pool,
        jobId,
        PHASE.INSERTING,
        `Aba "${sheetName}": lendo e inserindo linha a linha…`
      );

      let headers = null;
      let batch = [];

      for await (const row of worksheetReader) {
        if (row.number === 1) {
          headers = (row.values || [])
            .slice(1)
            .map((h, idx) => {
              const label = cellToString(h).trim();
              return label || `col_${idx + 1}`;
            });
          continue;
        }

        if (!headers?.length) continue;

        const rowObj = rowToObject(headers, row);
        if (!headerSniffDone) {
          headerSniffDone = true;
          await setDetectedOperator(pool, jobId, sniffOperatorFromRow(rowObj));
        }

        batch.push(rowObj);
        scannedLines += 1;

        if (batch.length >= BATCH_ROWS) {
          await flushBatch(batch, sheetName);
          batch = [];
        }

        if (scannedLines % PROGRESS_EVERY === 0) {
          logJob(jobId, `XLSX: ${scannedLines.toLocaleString("pt-BR")} linhas processadas…`);
        }
      }

      await flushBatch(batch, sheetName);
    }
  } catch (error) {
    const msg = error?.message || String(error);
    if (/heap|memory|OOM|alloc/i.test(msg)) {
      throw new Error(
        `Memória insuficiente ao ler "${originalName}". Exporte a planilha como CSV (;) e importe o .csv — arquivos grandes em Excel costumam falhar no servidor.`
      );
    }
    throw new Error(`Falha ao ler planilha (${originalName}): ${msg}`);
  }

  if (sheetIndex === 0) {
    throw new Error(`Planilha vazia ou formato não suportado: ${originalName}`);
  }

  await updateImportJobFileStats(pool, jobId, originalName, { importedRows, ignoredRows });

  logJob(
    jobId,
    `XLSX finalizado: lidas=${scannedLines}, gravadas=${processedInserts}, válidas=${importedRows}, ignoradas=${ignoredRows}.`
  );

  return {
    scannedLines,
    processedInserts,
    importedRows,
    ignoredRows,
  };
}
