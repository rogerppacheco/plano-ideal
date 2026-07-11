import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import multer from "multer";
import { pool } from "../db.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  countRecordsForJob,
  registerImportJobFiles,
  revertImportJob,
} from "../services/importJobService.js";
import { validateImportFile } from "../config/importLimits.js";
import { recoverStuckJob } from "../services/importJobRecovery.js";

const router = express.Router();
const upload = multer({ dest: path.join(os.tmpdir(), "planoideal-imports") });

router.post("/import", requireAuth, requireRole(ROLES.ADMIN, ROLES.MANAGER), upload.array("files"), async (req, res) => {
  const operator = String(req.body.operator || "").trim();
  if (!operator) {
    return res.status(400).json({ message: "Operadora é obrigatória." });
  }

  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ message: "Nenhum arquivo enviado." });
  }

  for (const file of files) {
    const check = validateImportFile(file);
    if (!check.ok) {
      return res.status(400).json({ message: check.message });
    }
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

router.get("/import/jobs/active", requireAuth, requireRole(ROLES.ADMIN, ROLES.MANAGER), async (_req, res) => {
  const jobQuery = `
    SELECT id, operator, status, created_at, started_at, finished_at,
           total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
           current_step, file_bytes_read, heartbeat_at, progress_phase
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
             current_step, file_bytes_read, heartbeat_at, progress_phase
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

  await recoverStuckJob(pool, job.id);
  const refreshed = await pool.query(
    `
      SELECT id, operator, status, created_at, started_at, finished_at,
             total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
             current_step, file_bytes_read, heartbeat_at, progress_phase
      FROM import_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [job.id]
  );
  const finalJob = refreshed.rows[0];
  if (!finalJob || !["queued", "processing"].includes(finalJob.status)) {
    return res.json({ job: null });
  }
  return res.json({ job: { ...finalJob, files } });
});

router.get("/import/jobs", requireAuth, requireRole(ROLES.ADMIN, ROLES.MANAGER), async (_req, res) => {
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

router.get("/import/jobs/:jobId", requireAuth, requireRole(ROLES.ADMIN, ROLES.MANAGER), async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ message: "Job inválido." });
  }

  const fullQuery = `
    SELECT id, operator, detected_operator, status, created_at, started_at, finished_at,
           total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
           current_step, file_bytes_read, heartbeat_at, progress_phase, reverted_at, records_deleted
    FROM import_jobs
    WHERE id = $1
    LIMIT 1
  `;
  const basicQuery = `
    SELECT id, operator, status, created_at, started_at, finished_at,
           total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
           current_step, file_bytes_read, heartbeat_at, progress_phase
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

  const recovery = await recoverStuckJob(pool, jobId);
  const row = recovery.action === "completed"
    ? (await pool.query(fullQuery, [jobId]).catch(() => pool.query(basicQuery, [jobId]))).rows[0]
    : result.rows[0];

  return res.json({
    ...row,
    recovered: recovery.action === "completed" || recovery.action === "failed",
    operator_mismatch:
      row.detected_operator && row.operator && row.detected_operator !== row.operator,
  });
});

router.post("/import/jobs/:jobId/complete", requireAuth, requireRole(ROLES.ADMIN, ROLES.MANAGER), async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ message: "Job inválido." });
  }

  const recovery = await recoverStuckJob(pool, jobId);
  if (recovery.action === "completed") {
    return res.json({
      message: `Importação #${jobId} marcada como concluída. Os dados já estavam no banco.`,
      job: recovery.job,
    });
  }
  if (recovery.action === "failed") {
    return res.json({
      message: recovery.job?.error_message || `Importação #${jobId} marcada como falha.`,
      job: recovery.job,
    });
  }

  const job = recovery.job;
  if (!job) {
    return res.status(404).json({ message: "Job não encontrado." });
  }
  if (job.status === "completed") {
    return res.json({ message: "Esta importação já está concluída.", job });
  }
  if (job.status !== "processing") {
    return res.status(409).json({ message: `Job em status "${job.status}" — não é possível concluir.` });
  }

  const total = Number(job.total_rows || 0);
  const processed = Number(job.processed_rows || 0);
  if (total <= 0 || processed < total) {
    return res.status(409).json({
      message: `Ainda faltam linhas (${processed.toLocaleString("pt-BR")} / ${total.toLocaleString("pt-BR")}).`,
    });
  }

  return res.status(409).json({
    message: "Aguarde alguns minutos ou atualize a página para recuperação automática.",
  });
});

router.delete("/import/jobs/:jobId", requireAuth, requireRole(ROLES.ADMIN, ROLES.MANAGER), async (req, res) => {
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

router.get("/import/summary", requireAuth, requireRole(ROLES.ADMIN, ROLES.MANAGER), async (_req, res) => {
  // Soma por job concluído — rápido mesmo com milhões de linhas em coverage_records.
  // COUNT(*) em coverage_records estourava timeout do Railway e o painel ficava em 0.
  const totalsQuery = `
    SELECT operator, COALESCE(SUM(imported_rows), 0)::bigint AS total
    FROM import_jobs
    WHERE status = 'completed'
      AND reverted_at IS NULL
    GROUP BY operator
    ORDER BY operator
  `;

  const totalsResult = await pool.query(totalsQuery);

  const byOperator = totalsResult.rows.reduce((acc, row) => {
    acc[row.operator] = Number(row.total) || 0;
    return acc;
  }, {});

  const fieldsByOperator = {};
  const fieldSampleQuery = `
    SELECT row_data
    FROM coverage_records
    WHERE operator = $1
    ORDER BY imported_at DESC NULLS LAST, id DESC
    LIMIT 1
  `;
  const fieldTimeoutMs = Number(process.env.IMPORT_SUMMARY_FIELD_TIMEOUT_MS ?? 4000);

  await Promise.all(
    Object.keys(byOperator).map(async (operator) => {
      fieldsByOperator[operator] = [];
      try {
        const sample = await Promise.race([
          pool.query(fieldSampleQuery, [operator]),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("timeout")), fieldTimeoutMs);
          }),
        ]);
        const rowData = sample.rows[0]?.row_data;
        if (rowData && typeof rowData === "object") {
          fieldsByOperator[operator] = Object.keys(rowData).sort((a, b) =>
            a.localeCompare(b, "pt-BR")
          );
        }
      } catch {
        fieldsByOperator[operator] = [];
      }
    })
  );

  const totalImportedRows = Object.values(byOperator).reduce((acc, n) => acc + n, 0);

  let activeJob = null;
  try {
    const activeResult = await pool.query(
      `
        SELECT id, operator, status, created_at, started_at,
               total_rows, processed_rows, imported_rows, ignored_rows,
               current_step, error_message, heartbeat_at, progress_phase
        FROM import_jobs
        WHERE status IN ('queued', 'processing')
        ORDER BY created_at DESC
        LIMIT 1
      `
    );
    activeJob = activeResult.rows[0] || null;
    if (activeJob?.id) {
      const recovery = await recoverStuckJob(pool, activeJob.id);
      if (recovery.action === "completed" || recovery.action === "failed") {
        activeJob = null;
      }
    }
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

  worker.on("message", async (msg) => {
    if (msg?.ok) {
      const recovery = await recoverStuckJob(pool, jobId);
      if (recovery.action !== "completed") {
        const row = await pool.query(
          `SELECT status FROM import_jobs WHERE id = $1`,
          [jobId]
        );
        if (row.rows[0]?.status === "processing") {
          await markJobAsCompleted(jobId);
        }
      }
      return;
    }
    if (msg?.ok === false) {
      await markJobAsFailed(jobId, msg.message || "Falha no worker de importação.");
    }
  });

  worker.on("error", async (error) => {
    await markJobAsFailed(jobId, error?.message || "Falha no worker de importação.");
    await cleanupFiles(files);
  });

  worker.on("exit", async (code) => {
    if (code !== 0) {
      await markJobAsFailed(jobId, `Worker finalizado com código ${code}.`);
    } else {
      await recoverStuckJob(pool, jobId);
    }
    await cleanupFiles(files);
  });
}

async function markJobAsCompleted(jobId) {
  await pool.query(
    `
      UPDATE import_jobs
      SET status = 'completed',
          finished_at = COALESCE(finished_at, NOW()),
          error_message = NULL,
          current_step = 'Importação concluída.',
          progress_phase = NULL,
          heartbeat_at = NOW()
      WHERE id = $1
        AND status = 'processing'
    `,
    [jobId]
  );
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
