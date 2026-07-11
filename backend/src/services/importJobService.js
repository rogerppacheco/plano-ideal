import fs from "node:fs";

export async function registerImportJobFiles(pool, jobId, files) {
  for (const file of files) {
    let size = file.size ?? 0;
    if (!size && file.path) {
      try {
        size = fs.statSync(file.path).size;
      } catch {
        size = 0;
      }
    }
    await pool.query(
      `
        INSERT INTO import_job_files (job_id, file_name, file_size_bytes)
        VALUES ($1, $2, $3)
        ON CONFLICT (job_id, file_name) DO UPDATE SET
          file_size_bytes = EXCLUDED.file_size_bytes
      `,
      [jobId, file.originalname || file.file_name, size]
    );
  }
}

export async function updateImportJobFileStats(pool, jobId, fileName, stats) {
  await pool.query(
    `
      UPDATE import_job_files
      SET rows_imported = $3,
          rows_ignored = $4
      WHERE job_id = $1 AND file_name = $2
    `,
    [jobId, fileName, stats.importedRows ?? 0, stats.ignoredRows ?? 0]
  );
}

export async function setDetectedOperator(pool, jobId, detected) {
  if (!detected) return;
  await pool.query(
    `
      UPDATE import_jobs
      SET detected_operator = $2
      WHERE id = $1 AND (detected_operator IS NULL OR detected_operator = '')
    `,
    [jobId, detected]
  );
}

export async function countRecordsForJob(pool, jobId) {
  const linked = await pool.query(
    `SELECT COUNT(*)::INT AS total FROM coverage_records WHERE import_job_id = $1`,
    [jobId]
  );
  if (linked.rows[0].total > 0) return linked.rows[0].total;

  const fallback = await pool.query(
    `
      SELECT COUNT(*)::INT AS total
      FROM coverage_records cr
      INNER JOIN import_job_files f ON f.job_id = $1 AND cr.source_file = f.file_name
      INNER JOIN import_jobs j ON j.id = $1 AND cr.operator = j.operator
      WHERE cr.import_job_id IS NULL
    `,
    [jobId]
  );
  return fallback.rows[0].total;
}

export async function revertImportJob(pool, jobId) {
  const jobResult = await pool.query(
    `SELECT id, operator, status, reverted_at FROM import_jobs WHERE id = $1`,
    [jobId]
  );
  const job = jobResult.rows[0];
  if (!job) return { ok: false, status: 404, message: "Importação não encontrada." };
  if (job.status === "processing" || job.status === "queued") {
    return { ok: false, status: 409, message: "Aguarde a importação terminar antes de remover." };
  }
  if (job.reverted_at) {
    return { ok: false, status: 409, message: "Esta importação já foi removida do banco." };
  }

  const linkedDelete = await pool.query(`DELETE FROM coverage_records WHERE import_job_id = $1`, [
    jobId,
  ]);
  let deleted = linkedDelete.rowCount ?? 0;

  if (deleted === 0) {
    const fallbackDelete = await pool.query(
      `
        DELETE FROM coverage_records cr
        USING import_job_files f, import_jobs j
        WHERE j.id = $1
          AND f.job_id = j.id
          AND cr.operator = j.operator
          AND cr.source_file = f.file_name
          AND cr.import_job_id IS NULL
      `,
      [jobId]
    );
    deleted = fallbackDelete.rowCount ?? 0;
  }

  if (deleted === 0) {
    const legacyDelete = await pool.query(
      `
        DELETE FROM coverage_records cr
        USING import_jobs j
        WHERE j.id = $1
          AND cr.operator = j.operator
          AND cr.import_job_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM import_job_files f WHERE f.job_id = j.id)
          AND cr.imported_at >= COALESCE(j.started_at, j.created_at) - INTERVAL '2 minutes'
          AND cr.imported_at <= COALESCE(j.finished_at, NOW()) + INTERVAL '15 minutes'
      `,
      [jobId]
    );
    deleted = legacyDelete.rowCount ?? 0;
  }

  await pool.query(
    `
      UPDATE import_jobs
      SET reverted_at = NOW(),
          records_deleted = $2,
          current_step = 'Importação removida do banco pelo usuário.'
      WHERE id = $1
    `,
    [jobId, deleted]
  );

  return { ok: true, deleted };
}
