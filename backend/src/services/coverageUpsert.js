/**
 * Insere ou atualiza cobertura (unitário ou em lote).
 * Com dedup_secondary: UPSERT. Sem dedup: INSERT simples.
 */

const DEFAULT_BATCH_CHUNK = Number(process.env.IMPORT_BATCH_SIZE ?? 500);

export async function insertCoverageRecord(pool, record, userId) {
  await insertCoverageRecordsBatch(pool, [record], userId, 1);
}

export async function insertCoverageRecordsBatch(
  pool,
  records,
  userId,
  chunkSize = DEFAULT_BATCH_CHUNK
) {
  if (!records?.length) return { inserted: 0 };

  let inserted = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = dedupeRecordsInChunk(records.slice(i, i + chunkSize));
    const withDedup = chunk.filter((r) => (r.dedupSecondary ?? "") !== "");
    const withoutDedup = chunk.filter((r) => (r.dedupSecondary ?? "") === "");

    if (withDedup.length) {
      await upsertChunkWithDedup(pool, withDedup, userId);
      inserted += withDedup.length;
    }
    if (withoutDedup.length) {
      await insertChunkWithoutDedup(pool, withoutDedup, userId);
      inserted += withoutDedup.length;
    }
  }
  return { inserted };
}

/** Evita "ON CONFLICT DO UPDATE cannot affect row a second time" no mesmo INSERT. */
function dedupeRecordsInChunk(records) {
  const byKey = new Map();
  for (const r of records) {
    const key = `${r.operator}\0${r.cepDigits}\0${r.dedupSecondary ?? ""}`;
    byKey.set(key, r);
  }
  return [...byKey.values()];
}

async function upsertChunkWithDedup(pool, records, userId) {
  const cepDigits = records.map((r) => r.cepDigits);
  const operators = records.map((r) => r.operator);
  const sourceFiles = records.map((r) => r.sourceFile);
  const sheetNames = records.map((r) => r.sheetName ?? null);
  const rowData = records.map((r) => JSON.stringify(r.rowData));
  const dedupSecondary = records.map((r) => r.dedupSecondary ?? "");
  const importJobIds = records.map((r) => r.importJobId ?? null);

  await pool.query(
    `
      INSERT INTO coverage_records
        (cep_digits, operator, source_file, sheet_name, row_data, imported_by, dedup_secondary, import_job_id)
      SELECT
        u.cep,
        u.op,
        u.src,
        u.sheet,
        u.data::jsonb,
        $2::integer,
        u.dedup,
        u.job
      FROM UNNEST(
        $1::char(8)[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::text[],
        $7::text[],
        $8::bigint[]
      ) AS u(cep, op, src, sheet, data, dedup, job)
      ON CONFLICT (operator, cep_digits, dedup_secondary) WHERE (dedup_secondary <> '')
      DO UPDATE SET
        source_file = EXCLUDED.source_file,
        sheet_name = EXCLUDED.sheet_name,
        row_data = EXCLUDED.row_data,
        imported_by = EXCLUDED.imported_by,
        imported_at = NOW(),
        import_job_id = COALESCE(EXCLUDED.import_job_id, coverage_records.import_job_id)
    `,
    [cepDigits, userId, operators, sourceFiles, sheetNames, rowData, dedupSecondary, importJobIds]
  );
}

async function insertChunkWithoutDedup(pool, records, userId) {
  const cepDigits = records.map((r) => r.cepDigits);
  const operators = records.map((r) => r.operator);
  const sourceFiles = records.map((r) => r.sourceFile);
  const sheetNames = records.map((r) => r.sheetName ?? null);
  const rowData = records.map((r) => JSON.stringify(r.rowData));
  const dedupSecondary = records.map((r) => r.dedupSecondary ?? "");
  const importJobIds = records.map((r) => r.importJobId ?? null);

  await pool.query(
    `
      INSERT INTO coverage_records
        (cep_digits, operator, source_file, sheet_name, row_data, imported_by, dedup_secondary, import_job_id)
      SELECT
        u.cep,
        u.op,
        u.src,
        u.sheet,
        u.data::jsonb,
        $2::integer,
        u.dedup,
        u.job
      FROM UNNEST(
        $1::char(8)[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::text[],
        $7::text[],
        $8::bigint[]
      ) AS u(cep, op, src, sheet, data, dedup, job)
    `,
    [cepDigits, userId, operators, sourceFiles, sheetNames, rowData, dedupSecondary, importJobIds]
  );
}
