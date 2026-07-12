import { pool } from "../db.js";

const MIN_INTERVAL_MS = 60_000;
const MAX_PER_DAY = 30;

export async function checkOsRateLimit(userId) {
  const lastQuery = `
    SELECT created_at
    FROM os_consultations
    WHERE requested_by = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const { rows: lastRows } = await pool.query(lastQuery, [userId]);
  if (lastRows[0]?.created_at) {
    const elapsed = Date.now() - new Date(lastRows[0].created_at).getTime();
    if (elapsed < MIN_INTERVAL_MS) {
      const waitSec = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
      return { ok: false, message: `Aguarde ${waitSec}s antes de nova consulta de OS.` };
    }
  }

  const dayQuery = `
    SELECT COUNT(*)::INT AS total
    FROM os_consultations
    WHERE requested_by = $1
      AND created_at >= date_trunc('day', NOW())
  `;
  const { rows: dayRows } = await pool.query(dayQuery, [userId]);
  if ((dayRows[0]?.total || 0) >= MAX_PER_DAY) {
    return { ok: false, message: "Limite diário de consultas OS atingido (30)." };
  }

  return { ok: true };
}
