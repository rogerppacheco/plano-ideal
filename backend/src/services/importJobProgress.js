/** Fases de importação persistidas em import_jobs.progress_phase */

export const PHASE = {
  QUEUED: "queued",
  READING: "reading",
  PARSING: "parsing",
  INSERTING: "inserting",
  FINALIZING: "finalizing",
};

export async function setProgressPhase(pool, jobId, phase, step = null) {
  if (step != null) {
    await pool.query(
      `
        UPDATE import_jobs
        SET progress_phase = $2,
            current_step = $3,
            heartbeat_at = NOW()
        WHERE id = $1
      `,
      [jobId, phase, step]
    );
    return;
  }
  await pool.query(
    `
      UPDATE import_jobs
      SET progress_phase = $2,
          heartbeat_at = NOW()
      WHERE id = $1
    `,
    [jobId, phase]
  );
}

export async function updateJobProgress(
  pool,
  { jobId, totalRows, processedRows, importedRows, ignoredRows, phase = PHASE.INSERTING }
) {
  await pool.query(
    `
      UPDATE import_jobs
      SET total_rows = $2,
          processed_rows = $3,
          imported_rows = $4,
          ignored_rows = $5,
          progress_phase = $6,
          heartbeat_at = NOW()
      WHERE id = $1
    `,
    [jobId, totalRows, processedRows, importedRows, ignoredRows, phase]
  );
}
