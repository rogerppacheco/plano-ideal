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

    CREATE INDEX IF NOT EXISTS idx_coverage_operator_imported
    ON coverage_records (operator, imported_at DESC, id DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at
    ON import_jobs (created_at DESC);
  `);

  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS current_step TEXT;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS file_bytes_read BIGINT;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS progress_phase TEXT;`);
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

  await ensureCreditConsultationSchema(pool);
  await ensureUserGovernanceSchema(pool);
  await ensureExternalApiSchema(pool);

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

export async function ensureCreditConsultationSchema(clientPool = pool) {
  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS pap_bo_credentials (
      id BIGSERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      matricula_pap TEXT NOT NULL,
      senha_pap_encrypted TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      in_use_by BIGINT,
      locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS pap_tt_matriculas (
      id BIGSERIAL PRIMARY KEY,
      matricula TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS pap_tt_daily_usage (
      matricula TEXT NOT NULL,
      usage_date DATE NOT NULL,
      consultas INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (matricula, usage_date)
    );
  `);

  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS credit_consultations (
      id BIGSERIAL PRIMARY KEY,
      requested_by INTEGER NOT NULL REFERENCES internal_users(id),
      document TEXT NOT NULL,
      cpf_representative TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'success', 'failed')),
      approved BOOLEAN,
      result_detail TEXT,
      error_message TEXT,
      screenshot_base64 TEXT,
      duration_seconds NUMERIC(8,1),
      pap_bo_credential_id INTEGER REFERENCES pap_bo_credentials(id),
      pap_tt_matricula TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 2,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_credit_consultations_status_created
    ON credit_consultations (status, created_at ASC);
  `);
  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_credit_consultations_user_created
    ON credit_consultations (requested_by, created_at DESC);
  `);
  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_pap_bo_credentials_enabled
    ON pap_bo_credentials (enabled, in_use_by);
  `);
}

const USER_ROLES = ["admin", "manager", "operator"];

const AUDIT_ACTIONS = [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_PASSWORD_CHANGED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "USER_DELETED",
  "USER_LOGIN",
  "PARTNER_CREATED",
  "PARTNER_UPDATED",
  "API_KEY_CREATED",
  "API_KEY_REVOKED",
  "EXTERNAL_COVERAGE_LOOKUP",
  "EXTERNAL_CREDIT_CONSULT",
];

/**
 * Governança de usuários: RBAC expandido, soft delete, auditoria e FKs para hard delete seguro.
 */
export async function ensureUserGovernanceSchema(clientPool = pool) {
  await clientPool.query(`
    ALTER TABLE internal_users
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  await clientPool.query(`
    ALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_role_check;
  `);

  await clientPool.query(`
    UPDATE internal_users
    SET role = 'operator', updated_at = NOW()
    WHERE role = 'vendedor';
  `);

  await clientPool.query(`
    ALTER TABLE internal_users
      ADD CONSTRAINT internal_users_role_check
      CHECK (role IN ('admin', 'manager', 'operator'));
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_internal_users_active
    ON internal_users (is_active)
    WHERE is_active = TRUE;
  `);

  await ensureForeignKeyOnDeleteSetNull(clientPool, "coverage_records", "imported_by");
  await ensureForeignKeyOnDeleteSetNull(clientPool, "import_jobs", "created_by");

  const auditActionList = AUDIT_ACTIONS.map((action) => `'${action}'`).join(", ");
  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK (action IN (${auditActionList})),
      target_user_id INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target
    ON audit_logs (target_user_id, created_at DESC);
  `);
  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
    ON audit_logs (actor_user_id, created_at DESC);
  `);
  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
    ON audit_logs (action, created_at DESC);
  `);
}

async function ensureForeignKeyOnDeleteSetNull(clientPool, tableName, columnName) {
  const { rows: tableRows } = await clientPool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = $1
      ) AS ok
    `,
    [tableName]
  );
  if (!tableRows[0]?.ok) return;

  const { rows: fkRows } = await clientPool.query(
    `
      SELECT
        c.conname AS constraint_name,
        c.confdeltype AS on_delete
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
      WHERE n.nspname = current_schema()
        AND t.relname = $1
        AND c.contype = 'f'
        AND a.attname = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );

  if (fkRows[0]?.on_delete === "n") return;

  if (fkRows[0]?.constraint_name) {
    await clientPool.query(
      `ALTER TABLE ${tableName} DROP CONSTRAINT "${fkRows[0].constraint_name}"`
    );
  }

  const constraintName = `${tableName}_${columnName}_fkey`;
  await clientPool.query(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT ${constraintName}
      FOREIGN KEY (${columnName}) REFERENCES internal_users(id) ON DELETE SET NULL
  `);
}

/**
 * API B2B: partners, api_keys, origem em credit_consultations e auditoria estendida.
 */
export async function ensureExternalApiSchema(clientPool = pool) {
  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      contact_email TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_partners_active
    ON partners (is_active)
    WHERE is_active = TRUE;
  `);

  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      key_prefix CHAR(8) NOT NULL,
      key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT '{coverage,credit}',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
      revoked_at TIMESTAMPTZ,
      revoked_by INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await clientPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash
    ON api_keys (key_hash)
    WHERE is_active = TRUE AND revoked_at IS NULL;
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_partner
    ON api_keys (partner_id, created_at DESC);
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix_active
    ON api_keys (key_prefix)
    WHERE is_active = TRUE AND revoked_at IS NULL;
  `);

  await clientPool.query(`
    ALTER TABLE credit_consultations
      ADD COLUMN IF NOT EXISTS api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal';
  `);

  await clientPool.query(`
    ALTER TABLE credit_consultations
      ALTER COLUMN requested_by DROP NOT NULL;
  `);

  await clientPool.query(`
    ALTER TABLE credit_consultations DROP CONSTRAINT IF EXISTS credit_consultations_source_check;
  `);

  await clientPool.query(`
    ALTER TABLE credit_consultations
      ADD CONSTRAINT credit_consultations_source_check
      CHECK (source IN ('internal', 'external'));
  `);

  await clientPool.query(`
    ALTER TABLE credit_consultations DROP CONSTRAINT IF EXISTS credit_consultations_origin_check;
  `);

  await clientPool.query(`
    ALTER TABLE credit_consultations
      ADD CONSTRAINT credit_consultations_origin_check CHECK (
        (source = 'internal' AND requested_by IS NOT NULL AND api_key_id IS NULL)
        OR
        (source = 'external' AND api_key_id IS NOT NULL)
      );
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_credit_consultations_api_key
    ON credit_consultations (api_key_id, created_at DESC)
    WHERE api_key_id IS NOT NULL;
  `);

  await clientPool.query(`
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL;
  `);

  await clientPool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_partner
    ON audit_logs (partner_id, created_at DESC);
  `);

  await ensureAuditLogActionConstraint(clientPool);
}

async function ensureAuditLogActionConstraint(clientPool) {
  const { rows } = await clientPool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'audit_logs'
    ) AS ok
  `);
  if (!rows[0]?.ok) return;

  const auditActionList = AUDIT_ACTIONS.map((action) => `'${action}'`).join(", ");
  await clientPool.query(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check`);
  await clientPool.query(`
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_action_check
      CHECK (action IN (${auditActionList}))
  `);
}

export { USER_ROLES, AUDIT_ACTIONS };
