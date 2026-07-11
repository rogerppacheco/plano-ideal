import fs from "node:fs";
import XLSX from "xlsx";
import { persistMappedRecords } from "./importPersist.js";
import { mapRowsToCoverageRecords, sniffOperatorFromRow } from "./importService.js";
import { PHASE, setProgressPhase } from "./importJobProgress.js";
import { setDetectedOperator, updateImportJobFileStats } from "./importJobService.js";

const BATCH_ROWS = 2500;
const PROGRESS_EVERY = 10000;
const HEADER_SCAN_LIMIT = 50;

function normalizeHeaderToken(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getHeaderScoreFromTokens(tokens) {
  if (!tokens.length) return 0;
  const set = new Set(tokens);
  let score = 0;
  if (set.has("cep")) score += 5;
  if ([...set].some((t) => t.endsWith("_cep") || t.startsWith("cep_") || t.includes("cep")))
    score += 3;
  if (set.has("logradouro")) score += 2;
  if (set.has("cidade") || set.has("municipio")) score += 2;
  if (set.has("bairro")) score += 1;
  if (set.has("uf")) score += 1;
  if (set.has("num") || set.has("numero")) score += 1;
  if (set.has("num_fachada") || [...set].some((t) => t.includes("fachada"))) score += 1;
  return score;
}

function readHeaders(ws, range, headerRowIndex) {
  const headerRange = {
    s: { r: headerRowIndex, c: range.s.c },
    e: { r: headerRowIndex, c: range.e.c },
  };
  const row = XLSX.utils.sheet_to_json(ws, {
    range: headerRange,
    header: 1,
    defval: "",
    raw: false,
  })[0];
  if (!Array.isArray(row)) return [];
  return row.map((h, idx) => {
    const label = String(h ?? "").trim();
    return label || `col_${idx + 1}`;
  });
}

function detectHeaderRowIndex(ws, range) {
  const maxRow = Math.min(range.e.r, range.s.r + HEADER_SCAN_LIMIT);
  let best = { rowIndex: range.s.r, score: -1, nonEmpty: 0 };
  for (let rowIndex = range.s.r; rowIndex <= maxRow; rowIndex += 1) {
    const rowRange = {
      s: { r: rowIndex, c: range.s.c },
      e: { r: rowIndex, c: range.e.c },
    };
    const row = XLSX.utils.sheet_to_json(ws, {
      range: rowRange,
      header: 1,
      defval: "",
      raw: false,
    })[0];
    const values = Array.isArray(row) ? row : [];
    const nonEmptyValues = values.map((v) => String(v ?? "").trim()).filter(Boolean);
    if (!nonEmptyValues.length) continue;
    const tokens = nonEmptyValues.map(normalizeHeaderToken).filter(Boolean);
    const score = getHeaderScoreFromTokens(tokens);
    if (score > best.score || (score === best.score && nonEmptyValues.length > best.nonEmpty)) {
      best = { rowIndex, score, nonEmpty: nonEmptyValues.length };
    }
    if (score >= 5) break;
  }
  return best.rowIndex;
}

function matrixToObjects(headers, matrix) {
  return matrix.map((arr) => {
    const obj = {};
    const row = Array.isArray(arr) ? arr : [];
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = row[i] != null ? String(row[i]) : "";
    }
    return obj;
  });
}

/**
 * Importa .xlsx via SheetJS em blocos (compatível com bases FTTH Vivo).
 */
export async function importXlsxFileSheetJs({
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
  logJob(jobId, `XLSX ${sizeMb} MB — SheetJS (leitura em blocos, padrão FTTH/Vivo).`);

  await setProgressPhase(
    pool,
    jobId,
    PHASE.READING,
    `Abrindo planilha (${sizeMb} MB) com SheetJS…`
  );

  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    cellStyles: false,
    cellNF: false,
    dense: false,
  });

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

    const persisted = await persistMappedRecords(pool, mapped, userId);
    importedRows += persisted.importedRows;
    ignoredRows += persisted.ignoredRows;
    processedInserts += persisted.processedInserts;

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

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws?.["!ref"]) continue;

    const range = XLSX.utils.decode_range(ws["!ref"]);
    if (range.e.r <= range.s.r) continue;

    const headerRowIndex = detectHeaderRowIndex(ws, range);
    const headers = readHeaders(ws, range, headerRowIndex);
    if (!headers.length) {
      throw new Error(`Planilha "${sheetName}" sem cabeçalho reconhecível em ${originalName}.`);
    }

    logJob(
      jobId,
      `Aba "${sheetName}": ${(range.e.r - range.s.r).toLocaleString("pt-BR")} linhas de dados (aprox.).`
    );

    await setProgressPhase(
      pool,
      jobId,
      PHASE.INSERTING,
      `Aba "${sheetName}": inserindo em blocos…`
    );

    for (let startRow = headerRowIndex + 1; startRow <= range.e.r; startRow += BATCH_ROWS) {
      const endRow = Math.min(startRow + BATCH_ROWS - 1, range.e.r);
      const chunkRange = {
        s: { r: startRow, c: range.s.c },
        e: { r: endRow, c: range.e.c },
      };
      const matrix = XLSX.utils.sheet_to_json(ws, {
        range: chunkRange,
        header: 1,
        defval: "",
        raw: false,
      });
      const batch = matrixToObjects(headers, matrix);

      if (!headerSniffDone && batch[0]) {
        headerSniffDone = true;
        await setDetectedOperator(pool, jobId, sniffOperatorFromRow(batch[0]));
      }

      scannedLines += batch.length;
      await flushBatch(batch, sheetName);

      if (scannedLines % PROGRESS_EVERY === 0) {
        logJob(jobId, `SheetJS: ${scannedLines.toLocaleString("pt-BR")} linhas processadas…`);
      }
    }
  }

  if (scannedLines === 0) {
    throw new Error(
      `Nenhuma linha lida em ${originalName}. Verifique se o arquivo tem dados e coluna CEP.`
    );
  }

  await updateImportJobFileStats(pool, jobId, originalName, { importedRows, ignoredRows });

  logJob(
    jobId,
    `SheetJS finalizado: lidas=${scannedLines}, gravadas=${processedInserts}, válidas=${importedRows}, ignoradas=${ignoredRows}.`
  );

  return {
    scannedLines,
    processedInserts,
    importedRows,
    ignoredRows,
  };
}
