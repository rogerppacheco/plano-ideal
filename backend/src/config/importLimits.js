/** Limites de upload/importação (ajustáveis por env no Railway). */

export const MAX_CSV_BYTES = Number(process.env.IMPORT_MAX_CSV_MB || 200) * 1024 * 1024;
export const MAX_XLSX_BYTES = Number(process.env.IMPORT_MAX_XLSX_MB || 120) * 1024 * 1024;
/** .xls antigo ainda usa leitura em memória — limite menor */
export const MAX_XLS_BYTES = Number(process.env.IMPORT_MAX_XLS_MB || 20) * 1024 * 1024;

export function validateImportFile(file) {
  const name = String(file.originalname || "").toLowerCase();
  const size = Number(file.size || 0);

  if (name.endsWith(".csv")) {
    if (size > MAX_CSV_BYTES) {
      return {
        ok: false,
        message: `CSV muito grande (${formatMb(size)}). Limite: ${formatMb(MAX_CSV_BYTES)}. Divida o arquivo ou remova colunas desnecessárias.`,
      };
    }
    return { ok: true };
  }

  if (name.endsWith(".xlsx")) {
    if (size > MAX_XLSX_BYTES) {
      return {
        ok: false,
        message: `Excel .xlsx muito grande (${formatMb(size)}). Limite: ${formatMb(MAX_XLSX_BYTES)}. Exporte como CSV (;) no Excel.`,
      };
    }
    return { ok: true };
  }

  if (name.endsWith(".xls")) {
    if (size > MAX_XLS_BYTES) {
      return {
        ok: false,
        message: `Excel .xls (${formatMb(size)}) excede ${formatMb(MAX_XLS_BYTES)}. Salve como .xlsx ou exporte CSV (;).`,
      };
    }
    return {
      ok: false,
      message:
        "Formato .xls não é recomendado. Abra no Excel e salve como .xlsx ou exporte CSV (;) para importar com segurança.",
    };
  }

  return { ok: false, message: "Formato não suportado. Use .csv ou .xlsx." };
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
