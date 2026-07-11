-- Migração 002: API B2B (partners, api_keys, origem externa em credit_consultations)
-- Aplicada automaticamente via ensureExternalApiSchema() no startup da API.

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

CREATE INDEX IF NOT EXISTS idx_partners_active
ON partners (is_active)
WHERE is_active = TRUE;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash
ON api_keys (key_hash)
WHERE is_active = TRUE AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_partner
ON api_keys (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix_active
ON api_keys (key_prefix)
WHERE is_active = TRUE AND revoked_at IS NULL;

ALTER TABLE credit_consultations
  ADD COLUMN IF NOT EXISTS api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal';

ALTER TABLE credit_consultations
  ALTER COLUMN requested_by DROP NOT NULL;

ALTER TABLE credit_consultations DROP CONSTRAINT IF EXISTS credit_consultations_source_check;
ALTER TABLE credit_consultations
  ADD CONSTRAINT credit_consultations_source_check
  CHECK (source IN ('internal', 'external'));

ALTER TABLE credit_consultations DROP CONSTRAINT IF EXISTS credit_consultations_origin_check;
ALTER TABLE credit_consultations
  ADD CONSTRAINT credit_consultations_origin_check CHECK (
    (source = 'internal' AND requested_by IS NOT NULL AND api_key_id IS NULL)
    OR
    (source = 'external' AND api_key_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_credit_consultations_api_key
ON credit_consultations (api_key_id, created_at DESC)
WHERE api_key_id IS NOT NULL;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_partner
ON audit_logs (partner_id, created_at DESC);
