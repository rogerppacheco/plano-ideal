/** Recupera jobs que gravaram todas as linhas mas não marcaram status=completed. */

const STALE_MINUTES = Number(process.env.IMPORT_JOB_STALE_MINUTES ?? "5");

export function isJobStuckWithData(job) {
  if (!job || job.status !== "processing") return false;
  const total = Number(job.total_rows || 0);
  const processed = Number(job.processed_rows || 0);
  if (total <= 0 || processed < total) return false;

  const heartbeat = job.heartbeat_at ? new Date(job.heartbeat_at).getTime() : null;
  if (!heartbeat || Number.isNaN(heartbeat)) return true;

  const ageMs = Date.now() - heartbeat;
  return ageMs >= STALE_MINUTES * 60 * 1000;
}

export async function autoCompleteStuckJob(pool, jobId) {
  const jobResult = await pool.query(
    `
      SELECT id, status, total_rows, processed_rows, imported_rows, ignored_rows, heartbeat_at
      FROM import_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId]
  );
  const job = jobResult.rows[0];
  if (!isJobStuckWithData(job)) {
    return { completed: false, job };
  }

  const update = await pool.query(
    `
      UPDATE import_jobs
      SET status = 'completed',
          finished_at = NOW(),
          error_message = NULL,
          current_step = 'Importação concluída (recuperada automaticamente).',
          progress_phase = NULL,
          heartbeat_at = NOW()
      WHERE id = $1
        AND status = 'processing'
      RETURNING id, status, total_rows, processed_rows, imported_rows, ignored_rows
    `,
    [jobId]
  );

  return { completed: update.rowCount > 0, job: update.rows[0] || job };
}
