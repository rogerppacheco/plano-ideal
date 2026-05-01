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

export function mapRowsToCoverageRecords({ rows, operator, sourceFile, sheetName }) {
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
      return {
        cepDigits,
        operator,
        sourceFile,
        sheetName,
        rowData: row,
      };
    })
    .filter(Boolean);

  return { records, imported, ignored };
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
