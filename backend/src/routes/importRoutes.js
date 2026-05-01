import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import multer from "multer";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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

  // Copia payload para processamento assíncrono sem depender do objeto req.
  const filePayload = files.map((file) => ({
    path: file.path,
    originalname: file.originalname,
  }));

  startImportWorker({ jobId, operator, userId: req.user.sub, files: filePayload });
  return res.status(202).json({ jobId, status: "queued" });
});

router.get("/import/jobs/:jobId", requireAuth, requireRole("admin"), async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ message: "Job inválido." });
  }

  const query = `
    SELECT id, operator, status, created_at, started_at, finished_at,
           total_files, total_rows, processed_rows, imported_rows, ignored_rows, error_message,
           current_step, file_bytes_read, heartbeat_at
    FROM import_jobs
    WHERE id = $1
    LIMIT 1
  `;
  const result = await pool.query(query, [jobId]);
  if (!result.rows[0]) {
    return res.status(404).json({ message: "Job não encontrado." });
  }

  return res.json(result.rows[0]);
});

router.get("/import/summary", requireAuth, requireRole("admin"), async (_req, res) => {
  const totalsQuery = `
    SELECT operator, COUNT(*)::INT AS total
    FROM coverage_records
    GROUP BY operator
    ORDER BY operator
  `;

  const fieldsQuery = `
    SELECT operator, ARRAY_AGG(DISTINCT key ORDER BY key) AS fields
    FROM coverage_records,
         LATERAL jsonb_object_keys(row_data) AS key
    GROUP BY operator
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
  return res.json({ totalImportedRows, byOperator, fieldsByOperator });
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
  await pool.query(
    `
      UPDATE import_jobs
      SET status = 'failed',
          finished_at = NOW(),
          error_message = $2
      WHERE id = $1
    `,
    [jobId, String(message || "Falha inesperada durante importação.")]
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
