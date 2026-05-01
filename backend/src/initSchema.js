import { pool } from "./db.js";

export async function ensureSchema() {
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
    CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at
    ON import_jobs (created_at DESC);
  `);

  // Jobs presos em queued/processing por muito tempo (ex.: API reiniciada no meio da importação).
  // Intervalo longo para não encerrar importações grandes legítimas; ajuste via IMPORT_JOB_STALE_HOURS.
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
