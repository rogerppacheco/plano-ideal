CREATE TABLE IF NOT EXISTS internal_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'vendedor')),
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  error_message TEXT,
  current_step TEXT,
  file_bytes_read BIGINT,
  heartbeat_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coverage_cep ON coverage_records (cep_digits);
CREATE INDEX IF NOT EXISTS idx_coverage_operator ON coverage_records (operator);

-- Upsert natural key por operadora (CEP + NUM ou CEP + NUM_FACHADA); vazio = sem deduplicação (várias linhas permitidas).
CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_natural_upsert
ON coverage_records (operator, cep_digits, dedup_secondary)
WHERE dedup_secondary <> '';
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs (created_at DESC);
