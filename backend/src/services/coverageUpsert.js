/**
 * Insere ou atualiza cobertura quando há chave secundária (NUM / NUM_FACHADA).
 * Sem chave secundária: apenas INSERT (comportamento anterior, permite várias linhas por CEP).
 */
export async function insertCoverageRecord(pool, record, userId) {
  const dedup = record.dedupSecondary ?? "";
  const rowJson = JSON.stringify(record.rowData);
  const importJobId = record.importJobId ?? null;
  const params = [
    record.cepDigits,
    record.operator,
    record.sourceFile,
    record.sheetName,
    rowJson,
    userId,
    dedup,
    importJobId,
  ];

  if (dedup) {
    await pool.query(
      `
        INSERT INTO coverage_records
          (cep_digits, operator, source_file, sheet_name, row_data, imported_by, dedup_secondary, import_job_id)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        ON CONFLICT (operator, cep_digits, dedup_secondary) WHERE (dedup_secondary <> '')
        DO UPDATE SET
          source_file = EXCLUDED.source_file,
          sheet_name = EXCLUDED.sheet_name,
          row_data = EXCLUDED.row_data,
          imported_by = EXCLUDED.imported_by,
          imported_at = NOW(),
          import_job_id = COALESCE(EXCLUDED.import_job_id, coverage_records.import_job_id)
      `,
      params
    );
  } else {
    await pool.query(
      `
        INSERT INTO coverage_records
          (cep_digits, operator, source_file, sheet_name, row_data, imported_by, dedup_secondary, import_job_id)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      `,
      params
    );
  }
}
