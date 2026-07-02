import { pool } from "../db.js";

const MIN_INTERVAL_MS = 60_000;
const MAX_PER_DAY = 15;

export async function checkCreditRateLimit(userId) {
  const lastQuery = `
    SELECT created_at
    FROM credit_consultations
    WHERE requested_by = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const { rows: lastRows } = await pool.query(lastQuery, [userId]);
  if (lastRows[0]?.created_at) {
    const elapsed = Date.now() - new Date(lastRows[0].created_at).getTime();
    if (elapsed < MIN_INTERVAL_MS) {
      const waitSec = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
      return { ok: false, message: `Aguarde ${waitSec}s antes de nova consulta.` };
    }
  }

  const dayQuery = `
    SELECT COUNT(*)::INT AS total
    FROM credit_consultations
    WHERE requested_by = $1
      AND created_at >= date_trunc('day', NOW())
  `;
  const { rows: dayRows } = await pool.query(dayQuery, [userId]);
  if ((dayRows[0]?.total || 0) >= MAX_PER_DAY) {
    return { ok: false, message: "Limite diário de consultas atingido (15)." };
  }

  return { ok: true };
}

export async function hasAvailableBoCredential() {
  const query = `
    SELECT EXISTS (
      SELECT 1 FROM pap_bo_credentials
      WHERE enabled = true AND in_use_by IS NULL
    ) AS ok
  `;
  const { rows } = await pool.query(query);
  return Boolean(rows[0]?.ok);
}
