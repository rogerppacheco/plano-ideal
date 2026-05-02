import { pool } from "./db.js";

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id BIGSERIAL PRIMARY KEY,
      operator TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
      created_by INTEGER REFERENCES internal_users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      total_files INTEGER NOT NULL DEFAULT 0,
      total_rows INTEGER NOT NULL DEFAULT 0,
      processed_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      ignored_rows INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at
    ON import_jobs (created_at DESC);
  `);

  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS current_step TEXT;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS file_bytes_read BIGINT;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;`);

  // Não bloqueia o start da API; tentativa em background (importação aguarda a mesma migração no worker).
  ensureCoverageDedupSchema(pool).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Falha na migração de deduplicação de coverage_records:", error);
  });

  // Jobs presos em queued/processing por muito tempo (ex.: API reiniciada no meio da importação).
  // Intervalo longo para não encerrar importações grandes legítimas; ajuste via IMPORT_JOB_STALE_HOURS.
  const staleHours = Number(process.env.IMPORT_JOB_STALE_HOURS ?? "168");
  if (Number.isFinite(staleHours) && staleHours > 0) {
    await pool.query(
      `
        UPDATE import_jobs
        SET status = 'failed',
            finished_at = NOW(),
            error_message = COALESCE(error_message, 'Importação interrompida (job antigo sem conclusão).')
        WHERE status IN ('queued', 'processing')
          AND created_at < NOW() - ($1 * INTERVAL '1 hour')
      `,
      [staleHours]
    );
  }
}

/**
 * Garante coluna dedup_secondary, backfill, deduplicação e índice único parcial exigido pelo ON CONFLICT do upsert.
 * Pode ser lenta em bases muito grandes; o worker chama isso antes de inserir para evitar erro de inferência do PostgreSQL.
 */
export async function ensureCoverageDedupSchema(clientPool = pool) {
  const { rows } = await clientPool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'coverage_records'
    ) AS ok
  `);
  if (!rows[0]?.ok) return;

  await clientPool.query(`
    ALTER TABLE coverage_records ADD COLUMN IF NOT EXISTS dedup_secondary TEXT NOT NULL DEFAULT '';
  `);

  await clientPool.query(`
    UPDATE coverage_records SET dedup_secondary = TRIM(REGEXP_REPLACE(
      LOWER(COALESCE(
        NULLIF(TRIM(row_data->>'NUM'), ''),
        NULLIF(TRIM(row_data->>'num'), '')
      )),
      '\\s+', ' ', 'g'))
    WHERE operator = 'Vivo'
      AND dedup_secondary = ''
      AND COALESCE(
        NULLIF(TRIM(row_data->>'NUM'), ''),
        NULLIF(TRIM(row_data->>'num'), '')
      ) IS NOT NULL;
  `);

  await clientPool.query(`
    UPDATE coverage_records SET dedup_secondary = TRIM(REGEXP_REPLACE(
      LOWER(COALESCE(
        NULLIF(TRIM(row_data->>'NUM_FACHADA'), ''),
        NULLIF(TRIM(row_data->>'Num_Fachada'), ''),
        NULLIF(TRIM(row_data->>'num_fachada'), '')
      )),
      '\\s+', ' ', 'g'))
    WHERE operator = 'Nio'
      AND dedup_secondary = ''
      AND COALESCE(
        NULLIF(TRIM(row_data->>'NUM_FACHADA'), ''),
        NULLIF(TRIM(row_data->>'Num_Fachada'), ''),
        NULLIF(TRIM(row_data->>'num_fachada'), '')
      ) IS NOT NULL;
  `);

  await clientPool.query(`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY operator, cep_digits, dedup_secondary
          ORDER BY imported_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM coverage_records
      WHERE dedup_secondary <> ''
    )
    DELETE FROM coverage_records cr
    USING ranked r
    WHERE cr.id = r.id AND r.rn > 1;
  `);

  await clientPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_natural_upsert
    ON coverage_records (operator, cep_digits, dedup_secondary)
    WHERE dedup_secondary <> '';
  `);
}
