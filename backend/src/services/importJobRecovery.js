/** Recupera jobs travados (finalização ou parse/OOM). */

const STALE_MINUTES = Number(process.env.IMPORT_JOB_STALE_MINUTES ?? "5");

function heartbeatAgeMs(job) {
  const heartbeat = job?.heartbeat_at ? new Date(job.heartbeat_at).getTime() : null;
  if (!heartbeat || Number.isNaN(heartbeat)) return null;
  return Date.now() - heartbeat;
}

function isStale(job) {
  const ageMs = heartbeatAgeMs(job);
  if (ageMs == null) return true;
  return ageMs >= STALE_MINUTES * 60 * 1000;
}

export function isJobStuckWithData(job) {
  if (!job || job.status !== "processing") return false;
  const total = Number(job.total_rows || 0);
  const processed = Number(job.processed_rows || 0);
  if (total <= 0 || processed < total) return false;
  return isStale(job);
}

export function isJobStuckWithoutProgress(job) {
  if (!job || job.status !== "processing") return false;
  if (!isStale(job)) return false;

  const total = Number(job.total_rows || 0);
  const processed = Number(job.processed_rows || 0);
  if (total > 0 && processed >= total) return false;

  const phase = String(job.progress_phase || "").toLowerCase();
  if (phase === "parsing" || phase === "reading") return true;
  if (total === 0 && processed === 0) return true;

  const step = String(job.current_step || "").toLowerCase();
  if (step.includes("parseando") || step.includes("parse")) return true;

  return false;
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

const OOM_FAIL_MESSAGE =
  "Importação interrompida: memória do servidor esgotada ao ler o Excel (.xlsx grande). " +
  "Exporte a planilha como CSV (delimitador ;) e importe o arquivo .csv.";

export async function failStuckProcessingJob(pool, jobId) {
  const jobResult = await pool.query(
    `
      SELECT id, status, total_rows, processed_rows, progress_phase, heartbeat_at, current_step
      FROM import_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId]
  );
  const job = jobResult.rows[0];
  if (!isJobStuckWithoutProgress(job)) {
    return { failed: false, job };
  }

  const update = await pool.query(
    `
      UPDATE import_jobs
      SET status = 'failed',
          finished_at = NOW(),
          error_message = $2,
          current_step = 'Falha na importação.',
          progress_phase = NULL,
          heartbeat_at = NOW()
      WHERE id = $1
        AND status = 'processing'
      RETURNING id, status, error_message
    `,
    [jobId, OOM_FAIL_MESSAGE]
  );

  return { failed: update.rowCount > 0, job: update.rows[0] || job };
}

/** Tenta concluir job 100% gravado; senão marca como falha se travado no parse. */
export async function recoverStuckJob(pool, jobId) {
  const completed = await autoCompleteStuckJob(pool, jobId);
  if (completed.completed) return { action: "completed", ...completed };

  const failed = await failStuckProcessingJob(pool, jobId);
  if (failed.failed) return { action: "failed", ...failed };

  return { action: "none", job: failed.job || completed.job };
}
