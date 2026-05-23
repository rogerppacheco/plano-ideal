import { insertCoverageRecordsBatch } from "./coverageUpsert.js";

/** Grava registros mapeados em lote (uso: CSV, XLSX, script FTTH). */
export async function persistMappedRecords(pool, mapped, userId) {
  const { inserted } = await insertCoverageRecordsBatch(pool, mapped.records, userId);
  return {
    processedInserts: inserted,
    importedRows: mapped.imported,
    ignoredRows: mapped.ignored,
  };
}
