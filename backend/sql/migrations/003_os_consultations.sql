-- Migração 003: Consulta OS interna + discriminação de lock BO (credit vs os)

ALTER TABLE pap_bo_credentials
  ADD COLUMN IF NOT EXISTS in_use_kind TEXT;

CREATE TABLE IF NOT EXISTS os_consultations (
  id BIGSERIAL PRIMARY KEY,
  requested_by INTEGER NOT NULL REFERENCES internal_users(id),
  document TEXT NOT NULL,
  numero_os_filtro TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'success', 'failed')),
  result_summary TEXT,
  results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  screenshot_base64 TEXT,
  duration_seconds NUMERIC(8,1),
  pap_bo_credential_id INTEGER REFERENCES pap_bo_credentials(id),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  source TEXT NOT NULL DEFAULT 'internal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_os_consultations_status_created
  ON os_consultations (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_os_consultations_user_created
  ON os_consultations (requested_by, created_at DESC);
