import { AUDIT_ACTIONS } from "../initSchema.js";
import { pool } from "../db.js";

const ALLOWED_ACTIONS = new Set(AUDIT_ACTIONS);

/**
 * Insere log de auditoria. Deve ser chamado dentro de uma transação aberta.
 * @param {import('pg').PoolClient} client
 */
export async function insertAuditLog(
  client,
  { actorUserId, action, targetUserId = null, partnerId = null, apiKeyId = null, metadata = {} }
) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Ação de auditoria inválida: ${action}`);
  }

  await client.query(
    `
      INSERT INTO audit_logs (
        actor_user_id,
        action,
        target_user_id,
        partner_id,
        api_key_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      actorUserId ?? null,
      action,
      targetUserId ?? null,
      partnerId ?? null,
      apiKeyId ?? null,
      JSON.stringify(metadata ?? {}),
    ]
  );
}

/**
 * Registra auditoria fora de transação (rotas B2B e telemetria).
 */
export async function recordAuditEvent({
  actorUserId = null,
  action,
  targetUserId = null,
  partnerId = null,
  apiKeyId = null,
  metadata = {},
}) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Ação de auditoria inválida: ${action}`);
  }

  await pool.query(
    `
      INSERT INTO audit_logs (
        actor_user_id,
        action,
        target_user_id,
        partner_id,
        api_key_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      actorUserId ?? null,
      action,
      targetUserId ?? null,
      partnerId ?? null,
      apiKeyId ?? null,
      JSON.stringify(metadata ?? {}),
    ]
  );
}
