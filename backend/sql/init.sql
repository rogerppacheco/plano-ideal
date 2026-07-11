-- Schema isolado do Plano Ideal (não usa public do Record/CRM).
CREATE SCHEMA IF NOT EXISTS plano_ideal;
SET search_path TO plano_ideal;

CREATE TABLE IF NOT EXISTS internal_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'operator')),
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  token_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coverage_records (
  id BIGSERIAL PRIMARY KEY,
  cep_digits CHAR(8) NOT NULL,
  operator TEXT NOT NULL,
  source_file TEXT NOT NULL,
  sheet_name TEXT,
  row_data JSONB NOT NULL,
  imported_by INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedup_secondary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGSERIAL PRIMARY KEY,
  operator TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  created_by INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_files INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  ignored_rows INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  current_step TEXT,
  file_bytes_read BIGINT,
  heartbeat_at TIMESTAMPTZ,
  progress_phase TEXT
);

CREATE INDEX IF NOT EXISTS idx_coverage_cep ON coverage_records (cep_digits);
CREATE INDEX IF NOT EXISTS idx_coverage_operator ON coverage_records (operator);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_natural_upsert
ON coverage_records (operator, cep_digits, dedup_secondary)
WHERE dedup_secondary <> '';

CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs (created_at DESC);

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS detected_operator TEXT;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS records_deleted INTEGER;

ALTER TABLE coverage_records ADD COLUMN IF NOT EXISTS import_job_id BIGINT
  REFERENCES import_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coverage_import_job
ON coverage_records (import_job_id)
WHERE import_job_id IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_import_job_files_job ON import_job_files (job_id);

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

CREATE TABLE IF NOT EXISTS pap_tt_matriculas (
  id BIGSERIAL PRIMARY KEY,
  matricula TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pap_tt_daily_usage (
  matricula TEXT NOT NULL,
  usage_date DATE NOT NULL,
  consultas INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (matricula, usage_date)
);

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

CREATE INDEX IF NOT EXISTS idx_credit_consultations_status_created
ON credit_consultations (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_credit_consultations_user_created
ON credit_consultations (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pap_bo_credentials_enabled
ON pap_bo_credentials (enabled, in_use_by);

CREATE INDEX IF NOT EXISTS idx_internal_users_active
ON internal_users (is_active)
WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'USER_CREATED',
    'USER_UPDATED',
    'USER_PASSWORD_CHANGED',
    'USER_DEACTIVATED',
    'USER_REACTIVATED',
    'USER_DELETED',
    'USER_LOGIN'
  )),
  target_user_id INTEGER REFERENCES internal_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target
ON audit_logs (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
ON audit_logs (action, created_at DESC);
