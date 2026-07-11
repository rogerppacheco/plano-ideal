-- Migração 001: Governança de usuários (RBAC, soft delete, auditoria)
-- Idempotente quando aplicada via ensureUserGovernanceSchema() em initSchema.js.
-- Uso manual: psql $DATABASE_URL -f backend/sql/migrations/001_user_governance.sql

SET search_path TO plano_ideal;

ALTER TABLE internal_users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE internal_users
SET role = 'operator', updated_at = NOW()
WHERE role = 'vendedor';

ALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_role_check;
ALTER TABLE internal_users
  ADD CONSTRAINT internal_users_role_check
  CHECK (role IN ('admin', 'manager', 'operator'));

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

-- FKs nullable: SET NULL ao excluir usuário (histórico preservado)
-- credit_consultations.requested_by permanece NOT NULL + RESTRICT (bloqueia hard delete)
