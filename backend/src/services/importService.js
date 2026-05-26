import XLSX from "xlsx";
import { normalizeCepDigits } from "../utils/cep.js";

export function parseWorkbookRows(fileBuffer, originalName) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const parsed = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
    parsed.push({
      sourceFile: originalName,
      sheetName,
      rows,
    });
  }

  return parsed;
}

/** Normaliza valor da chave secundária (NUM / NUM_FACHADA) para coincidir com dedupe no banco. */
export function normalizeDedupSecondary(value) {
  if (value == null) return "";
  const s = String(value).trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.toLowerCase();
}

/** Sugere operadora pelos cabeçalhos/colunas (NUM vs NUM_FACHADA). */
export function sniffOperatorFromRow(row) {
  const entries = Object.entries(row || {});
  let nioScore = 0;
  let vivoScore = 0;
  let veroScore = 0;
  for (const [rawKey] of entries) {
    const token = normalizeHeaderToken(rawKey);
    if (scoreNioNumFachadaColumn(token) > 0) nioScore += 1;
    if (scoreVivoNumColumn(token) > 0) vivoScore += 1;
    if (scoreVeroAddressColumn(token) > 0) veroScore += 1;
  }
  if (nioScore > vivoScore && nioScore > veroScore && nioScore > 0) return "Nio";
  if (vivoScore > nioScore && vivoScore > veroScore && vivoScore > 0) return "Vivo";
  if (veroScore > vivoScore && veroScore > nioScore && veroScore > 0) return "Vero";
  return null;
}

export function mapRowsToCoverageRecords({ rows, operator, sourceFile, sheetName, importJobId }) {
  let imported = 0;
  let ignored = 0;

  const records = rows
    .map((row) => {
      const cepValue = extractCepFromRow(row);
      const cepDigits = normalizeCepDigits(cepValue);
      if (cepDigits.length !== 8) {
        ignored += 1;
        return null;
      }
      imported += 1;
      const dedupSecondary = dedupSecondaryForOperator(operator, row);
      return {
        cepDigits,
        operator,
        sourceFile,
        sheetName,
        rowData: row,
        dedupSecondary,
        importJobId,
      };
    })
    .filter(Boolean);

  return { records, imported, ignored };
}

function dedupSecondaryForOperator(operator, row) {
  if (operator === "Vivo") {
    return normalizeDedupSecondary(extractVivoNumFromRow(row));
  }
  if (operator === "Nio") {
    return normalizeDedupSecondary(extractNioNumFachadaFromRow(row));
  }
  return "";
}

function scoreVivoNumColumn(headerNormalized) {
  const k = headerNormalized;
  if (!k) return 0;
  if (k.includes("fachada")) return 0;
  if (k === "num") return 100;
  if (k === "nu_num" || k === "nr_num" || k === "num_id" || k === "cod_num") return 95;
  if (k.endsWith("_num") && !k.includes("cep")) return 88;
  if (k === "numero") return 72;
  if (k.includes("numero") && !k.includes("cep") && !k.includes("fachada")) return 75;
  return 0;
}

function extractVivoNumFromRow(row) {
  const entries = Object.entries(row || {});
  if (!entries.length) return "";

  let bestScore = 0;
  let bestValue = "";

  for (const [rawKey, value] of entries) {
    const token = normalizeHeaderToken(rawKey);
    const score = scoreVivoNumColumn(token);
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  return bestScore > 0 ? bestValue : "";
}

function scoreNioNumFachadaColumn(headerNormalized) {
  const k = headerNormalized;
  if (!k) return 0;
  if (k === "num_fachada") return 100;
  if (k.startsWith("num_fachada") || k.includes("num_fachada")) return 96;
  if (k.includes("num") && k.includes("fachada")) return 92;
  if (k === "nu_fachada" || k === "nr_fachada") return 90;
  return 0;
}

function scoreVeroAddressColumn(headerNormalized) {
  const k = headerNormalized;
  if (!k) return 0;
  if (k === "logradouro" || k.includes("logradouro")) return 95;
  if (k === "bairro" || k.includes("bairro")) return 80;
  if (k === "cidade" || k === "municipio" || k.includes("municipio")) return 80;
  if (k === "uf") return 70;
  if (k.includes("cep")) return 65;
  return 0;
}

function extractNioNumFachadaFromRow(row) {
  const entries = Object.entries(row || {});
  if (!entries.length) return "";

  let bestScore = 0;
  let bestValue = "";

  for (const [rawKey, value] of entries) {
    const token = normalizeHeaderToken(rawKey);
    const score = scoreNioNumFachadaColumn(token);
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  return bestScore > 0 ? bestValue : "";
}

function normalizeHeaderToken(key) {
  return String(key ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function scoreCepColumn(headerNormalized) {
  const k = headerNormalized;
  if (!k) return 0;
  if (k === "cep") return 100;
  if (k === "nu_cep" || k === "nr_cep" || k === "num_cep" || k === "numero_cep") return 96;
  if (k === "cd_cep" || k === "cod_cep" || k === "codigo_cep") return 95;
  if (k.endsWith("_cep") || k.startsWith("cep_")) return 92;
  if (k.includes("codigo_postal") || k.includes("cod_postal") || k.includes("codigopostal")) return 88;
  if (k.includes("cep")) return 85;
  if (k.includes("zip") || k.includes("postal")) return 75;
  return 0;
}

function extractCepFromRow(row) {
  const entries = Object.entries(row || {});
  if (!entries.length) return "";

  let bestScore = 0;
  let bestValue = "";

  for (const [rawKey, value] of entries) {
    const token = normalizeHeaderToken(rawKey);
    const score = scoreCepColumn(token);
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  if (bestScore > 0) {
    return bestValue;
  }

  for (const [, value] of entries) {
    const digits = normalizeCepDigits(value);
    if (digits.length === 8) {
      return value;
    }
  }

  return "";
}
