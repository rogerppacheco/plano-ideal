import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import multer from "multer";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  countRecordsForJob,
  registerImportJobFiles,
  revertImportJob,
} from "../services/importJobService.js";

const router = express.Router();
const upload = multer({ dest: path.join(os.tmpdir(), "planoideal-imports") });

router.post("/import", requireAuth, requireRole("admin"), upload.array("files"), async (req, res) => {
  const operator = String(req.body.operator || "").trim();
  if (!operator) {
    return res.status(400).json({ message: "Operadora é obrigatória." });
  }

  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ message: "Nenhum arquivo enviado." });
  }

  const processingQuery = `
    SELECT id
    FROM import_jobs
    WHERE status IN ('queued', 'processing')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const processingResult = await pool.query(processingQuery);
  if (processingResult.rows[0]) {
    return res
      .status(409)
      .json({ message: "Já existe uma importação em andamento. Aguarde finalizar." });
  }

  const createJobQuery = `
    INSERT INTO import_jobs (operator, status, created_by, total_files)
    VALUES ($1, 'queued', $2, $3)
    RETURNING id
  `;
  const createResult = await pool.query(createJobQuery, [operator, req.user.sub, files.length]);
  const jobId = createResult.rows[0].id;

  await registerImportJobFiles(pool, jobId, files);

  // Copia payload para processamento assíncrono sem depender do objeto req.
  const filePayload = files.map((file) => ({
    path: file.path,
    originalname: file.originalname,
  }));

  startImportWorker({ jobId, operator, userId: req.user.sub, files: filePayload });
  return res.status(202).json({ jobId, status: "queued" });
});

router.get("/import/jobs/active", requireAuth, requireRole("admin"), async (_req, res) => {
  const jobQuery = `
    SELECT id, operator, status, created_at, started_at, finished_at,
           total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
           current_step, file_bytes_read, heartbeat_at
    FROM import_jobs
    WHERE status IN ('queued', 'processing')
      AND reverted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  let jobResult;
  try {
    jobResult = await pool.query(jobQuery);
  } catch {
    const fallbackQuery = `
      SELECT id, operator, status, created_at, started_at, finished_at,
             total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
             current_step, file_bytes_read, heartbeat_at
      FROM import_jobs
      WHERE status IN ('queued', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    jobResult = await pool.query(fallbackQuery);
  }

  const job = jobResult.rows[0];
  if (!job) {
    return res.json({ job: null });
  }

  let files = [];
  try {
    const filesResult = await pool.query(
      `
        SELECT file_name, file_size_bytes, rows_imported, rows_ignored
        FROM import_job_files
        WHERE job_id = $1
        ORDER BY id
      `,
      [job.id]
    );
    files = filesResult.rows;
  } catch {
    // tabela ainda não migrada
  }

  return res.json({ job: { ...job, files } });
});

router.get("/import/jobs", requireAuth, requireRole("admin"), async (_req, res) => {
  const fullQuery = `
    SELECT
      j.id,
      j.operator,
      j.detected_operator,
      j.status,
      j.created_at,
      j.started_at,
      j.finished_at,
      j.total_files,
      j.total_rows,
      j.imported_rows,
      j.ignored_rows,
      j.error_message,
      j.reverted_at,
      j.records_deleted,
      u.full_name AS created_by_name,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'file_name', f.file_name,
              'file_size_bytes', f.file_size_bytes,
              'rows_imported', f.rows_imported,
              'rows_ignored', f.rows_ignored
            )
            ORDER BY f.id
          )
          FROM import_job_files f
          WHERE f.job_id = j.id
        ),
        '[]'::json
      ) AS files
    FROM import_jobs j
    LEFT JOIN internal_users u ON u.id = j.created_by
    ORDER BY j.created_at DESC
    LIMIT 100
  `;
  const basicQuery = `
    SELECT
      j.id,
      j.operator,
      j.status,
      j.created_at,
      j.started_at,
      j.finished_at,
      j.total_files,
      j.total_rows,
      j.imported_rows,
      j.ignored_rows,
      j.error_message,
      u.full_name AS created_by_name,
      '[]'::json AS files
    FROM import_jobs j
    LEFT JOIN internal_users u ON u.id = j.created_by
    ORDER BY j.created_at DESC
    LIMIT 100
  `;

  let result;
  try {
    result = await pool.query(fullQuery);
  } catch {
    result = await pool.query(basicQuery);
  }

  const jobs = result.rows.map((row) => ({
    ...row,
    operator_mismatch:
      row.detected_operator &&
      row.operator &&
      row.detected_operator !== row.operator,
  }));
  return res.json({ jobs });
});

router.get("/import/jobs/:jobId", requireAuth, requireRole("admin"), async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ message: "Job inválido." });
  }

  const fullQuery = `
    SELECT id, operator, detected_operator, status, created_at, started_at, finished_at,
           total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
           current_step, file_bytes_read, heartbeat_at, reverted_at, records_deleted
    FROM import_jobs
    WHERE id = $1
    LIMIT 1
  `;
  const basicQuery = `
    SELECT id, operator, status, created_at, started_at, finished_at,
           total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
           current_step, file_bytes_read, heartbeat_at
    FROM import_jobs
    WHERE id = $1
    LIMIT 1
  `;
  let result;
  try {
    result = await pool.query(fullQuery, [jobId]);
  } catch {
    result = await pool.query(basicQuery, [jobId]);
  }
  if (!result.rows[0]) {
    return res.status(404).json({ message: "Job não encontrado." });
  }

  const row = result.rows[0];
  return res.json({
    ...row,
    operator_mismatch:
      row.detected_operator && row.operator && row.detected_operator !== row.operator,
  });
});

router.delete("/import/jobs/:jobId", requireAuth, requireRole("admin"), async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ message: "Job inválido." });
  }

  const pending = await pool.query(
    `SELECT id FROM import_jobs WHERE id = $1 AND status IN ('queued', 'processing')`,
    [jobId]
  );
  if (pending.rows[0]) {
    return res.status(409).json({ message: "Aguarde a importação terminar." });
  }

  const estimate = await countRecordsForJob(pool, jobId);
  const outcome = await revertImportJob(pool, jobId);
  if (!outcome.ok) {
    return res.status(outcome.status).json({ message: outcome.message });
  }

  return res.json({
    message: `Importação #${jobId} removida do banco.`,
    deletedRows: outcome.deleted,
    estimatedRows: estimate,
  });
});

router.get("/import/summary", requireAuth, requireRole("admin"), async (_req, res) => {
  const totalsQuery = `
    SELECT operator, COUNT(*)::INT AS total
    FROM coverage_records
    GROUP BY operator
    ORDER BY operator
  `;

  const fieldsQuery = `
    WITH latest_per_operator AS (
      SELECT DISTINCT ON (operator) operator, row_data
      FROM coverage_records
      ORDER BY operator, imported_at DESC, id DESC
    )
    SELECT operator,
           ARRAY(SELECT jsonb_object_keys(row_data) ORDER BY 1) AS fields
    FROM latest_per_operator
    ORDER BY operator
  `;

  const [totalsResult, fieldsResult] = await Promise.all([
    pool.query(totalsQuery),
    pool.query(fieldsQuery),
  ]);

  const byOperator = totalsResult.rows.reduce((acc, row) => {
    acc[row.operator] = row.total;
    return acc;
  }, {});

  const fieldsByOperator = fieldsResult.rows.reduce((acc, row) => {
    acc[row.operator] = row.fields || [];
    return acc;
  }, {});

  const totalImportedRows = totalsResult.rows.reduce((acc, row) => acc + row.total, 0);

  let activeJob = null;
  try {
    const activeResult = await pool.query(
      `
        SELECT id, operator, status, created_at, started_at,
               total_rows, processed_rows, imported_rows, ignored_rows,
               current_step, error_message
        FROM import_jobs
        WHERE status IN ('queued', 'processing')
        ORDER BY created_at DESC
        LIMIT 1
      `
    );
    activeJob = activeResult.rows[0] || null;
  } catch {
    // ignora se tabela/colunas ainda não existirem
  }

  return res.json({ totalImportedRows, byOperator, fieldsByOperator, activeJob });
});

export default router;

function startImportWorker({ jobId, operator, userId, files }) {
  const worker = new Worker(new URL("../workers/importWorker.js", import.meta.url), {
    workerData: {
      jobId,
      operator,
      userId,
      files,
      databaseUrl: process.env.DATABASE_URL,
    },
  });

  worker.on("error", async (error) => {
    await markJobAsFailed(jobId, error?.message || "Falha no worker de importação.");
    await cleanupFiles(files);
  });

  worker.on("exit", async (code) => {
    if (code !== 0) {
      await markJobAsFailed(jobId, `Worker finalizado com código ${code}.`);
    }
    await cleanupFiles(files);
  });
}

async function markJobAsFailed(jobId, message) {
  const text = String(message || "Falha inesperada durante importação.");
  await pool.query(
    `
      UPDATE import_jobs
      SET status = 'failed',
          finished_at = COALESCE(finished_at, NOW()),
          error_message = CASE
            WHEN error_message IS NULL OR BTRIM(error_message) = '' THEN $2
            ELSE error_message
          END
      WHERE id = $1
    `,
    [jobId, text]
  );
}

async function cleanupFiles(files) {
  for (const file of files) {
    try {
      if (file.path) {
        await fs.unlink(file.path);
      }
    } catch {
      // noop
    }
  }
}
