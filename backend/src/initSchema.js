import { getDbSchema, pool } from "./db.js";

export async function ensureSchema() {
  const schema = getDbSchema();
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query(`SET search_path TO ${schema}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS internal_users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'vendedor')),
      full_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coverage_records (
      id BIGSERIAL PRIMARY KEY,
      cep_digits CHAR(8) NOT NULL,
      operator TEXT NOT NULL,
      source_file TEXT NOT NULL,
      sheet_name TEXT,
      row_data JSONB NOT NULL,
      imported_by INTEGER REFERENCES internal_users(id),
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dedup_secondary TEXT NOT NULL DEFAULT ''
    );
  `);

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
    CREATE INDEX IF NOT EXISTS idx_coverage_cep ON coverage_records (cep_digits);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_coverage_operator ON coverage_records (operator);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at
    ON import_jobs (created_at DESC);
  `);

  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS current_step TEXT;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS file_bytes_read BIGINT;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS detected_operator TEXT;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS records_deleted INTEGER;`);
  await pool.query(`
    ALTER TABLE coverage_records ADD COLUMN IF NOT EXISTS import_job_id BIGINT
      REFERENCES import_jobs(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_coverage_import_job
    ON coverage_records (import_job_id)
    WHERE import_job_id IS NOT NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_job_files (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_size_bytes BIGINT NOT NULL DEFAULT 0,
      rows_imported INTEGER NOT NULL DEFAULT 0,
      rows_ignored INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (job_id, file_name)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_import_job_files_job
    ON import_job_files (job_id);
  `);

  ensureCoverageDedupSchema(pool).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Falha na migração de deduplicação de coverage_records:", error);
  });

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
 */
export async function ensureCoverageDedupSchema(clientPool = pool) {
  const schema = getDbSchema();
  const lockId = 48933107;
  const lockResult = await clientPool.query("SELECT pg_try_advisory_lock($1) AS ok", [lockId]);
  if (!lockResult.rows[0]?.ok) return;

  try {
    const { rows } = await clientPool.query(
      `
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = 'coverage_records'
        ) AS ok
      `,
      [schema]
    );
    if (!rows[0]?.ok) return;

    const readiness = await clientPool.query(
      `
        SELECT
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'coverage_records'
              AND column_name = 'dedup_secondary'
          ) AS has_col,
          EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = $1
              AND tablename = 'coverage_records'
              AND indexname = 'idx_coverage_natural_upsert'
          ) AS has_idx
      `,
      [schema]
    );
    if (readiness.rows[0]?.has_col && readiness.rows[0]?.has_idx) return;

    await clientPool.query("SET LOCAL lock_timeout = '1200ms'");

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
  } finally {
    await clientPool.query("SELECT pg_advisory_unlock($1)", [lockId]);
  }
}
