import fs from "node:fs";
import { open } from "node:fs/promises";
import { parse } from "csv-parse";
import { insertCoverageRecord } from "./coverageUpsert.js";
import { mapRowsToCoverageRecords } from "./importService.js";

const BATCH_ROWS = 2500;
const PROGRESS_LOG_EVERY = 10000;

export async function detectCsvDelimiter(filePath) {
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await fh.read(buf, 0, 65536, 0);
    const sample = buf.slice(0, bytesRead).toString("utf8");
    const lines = sample.split(/\r?\n/);
    const firstLine = lines.find((line) => line.trim().length > 0) || "";
    const semi = (firstLine.match(/;/g) || []).length;
    const comma = (firstLine.match(/,/g) || []).length;
    return semi >= comma ? ";" : ",";
  } finally {
    await fh.close();
  }
}

/**
 * Importa CSV grande por streaming (sem carregar o arquivo inteiro na RAM como o xlsx faz).
 * Atualiza progresso no job durante leitura e inserção.
 */
export async function importCsvFileStreaming({
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
  logJob(jobId, `CSV ${sizeMb} MB — streaming (sem parse monolítico xlsx).`);
  await setJobStep(pool, jobId, `CSV: preparando leitura (${sizeMb} MB)…`, stat.size);

  const delimiter = await detectCsvDelimiter(filePath);
  logJob(jobId, `CSV: delimitador detectado "${delimiter}". Streaming linha a linha.`);

  await setJobStep(
    pool,
    jobId,
    `CSV (${delimiter}): lendo e processando em blocos — o contador de linhas vai subindo durante a leitura…`,
    stat.size
  );

  let scannedLines = 0;
  let processedInserts = 0;
  let importedRows = 0;
  let ignoredRows = 0;
  let batch = [];

  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      delimiter,
      relax_column_count: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
    })
  );

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const chunk = batch;
    batch = [];

    const mapped = mapRowsToCoverageRecords({
      rows: chunk,
      operator,
      sourceFile: originalName,
      sheetName: "CSV",
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
    });

    await setJobStep(
      pool,
      jobId,
      `CSV: ${(baseTotals.totalRows + scannedLines).toLocaleString("pt-BR")} linhas lidas · ${(baseTotals.processedRows + processedInserts).toLocaleString("pt-BR")} inseridas no banco…`
    );
  };

  try {
    for await (const row of parser) {
      batch.push(row);
      scannedLines += 1;

      if (batch.length >= BATCH_ROWS) {
        await flushBatch();
      }

      if (scannedLines % PROGRESS_LOG_EVERY === 0) {
        logJob(jobId, `CSV: ${scannedLines.toLocaleString("pt-BR")} linhas lidas…`);
        await updateJobProgress(pool, {
          jobId,
          totalRows: baseTotals.totalRows + scannedLines,
          processedRows: baseTotals.processedRows + processedInserts,
          importedRows: baseTotals.importedRows + importedRows,
          ignoredRows: baseTotals.ignoredRows + ignoredRows,
        });
      }
    }
  } catch (error) {
    throw new Error(
      `Falha ao ler CSV (${originalName}): ${error?.message || error}. Verifique delimitador (; ou ,) e coluna CEP.`
    );
  }

  await flushBatch();

  logJob(
    jobId,
    `CSV finalizado: lidas=${scannedLines}, inseridas=${processedInserts}, válidas=${importedRows}, ignoradas=${ignoredRows}.`
  );

  return {
    scannedLines,
    processedInserts,
    importedRows,
    ignoredRows,
  };
}
