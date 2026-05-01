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

function extractCepFromRow(row) {
  const keys = Object.keys(row || {});
  const cepKey = keys.find((key) => key.toLowerCase().includes("cep"));
  return cepKey ? row[cepKey] : "";
}
