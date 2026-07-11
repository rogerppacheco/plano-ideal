import { importXlsxFileSheetJs } from "./xlsxSheetJsImport.js";
import { importXlsxFileExcelJs } from "./xlsxStreamImport.js";

/**
 * Importa .xlsx: tenta ExcelJS stream; se zero linhas, usa SheetJS (bases FTTH Vivo).
 */
export async function importXlsxFile(ctx) {
  const excelResult = await importXlsxFileExcelJs(ctx);
  if (excelResult.scannedLines > 0) {
    return excelResult;
  }

  ctx.logJob(ctx.jobId, "ExcelJS não leu linhas (formato FTTH?) — alternando para SheetJS…");
  return importXlsxFileSheetJs(ctx);
}

/** @deprecated use importXlsxFile */
export const importXlsxFileStreaming = importXlsxFile;
