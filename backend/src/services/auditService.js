import { AUDIT_ACTIONS } from "../initSchema.js";

const ALLOWED_ACTIONS = new Set(AUDIT_ACTIONS);

/**
 * Insere log de auditoria. Deve ser chamado dentro de uma transação aberta.
 * @param {import('pg').PoolClient} client
 */
export async function insertAuditLog(
  client,
  { actorUserId, action, targetUserId = null, metadata = {} }
) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Ação de auditoria inválida: ${action}`);
  }

  await client.query(
    `
      INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [actorUserId ?? null, action, targetUserId ?? null, JSON.stringify(metadata ?? {})]
  );
}
