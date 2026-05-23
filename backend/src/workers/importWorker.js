import { parentPort, workerData } from "node:worker_threads";
import { createPool } from "../db.js";
import {
  createJobLogger,
  markJobFailed,
  runImportJobFiles,
} from "../services/importJobRunner.js";

async function run() {
  const { jobId, operator, userId, files, databaseUrl } = workerData;
  const pool = createPool(databaseUrl);
  const logJob = createJobLogger(jobId);

  try {
    logJob(jobId, "Garantindo migração de dedup/índice (necessário para upsert)…");
    await runImportJobFiles({
      pool,
      databaseUrl,
      jobId,
      operator,
      userId,
      files,
      logJob,
    });
  } catch (error) {
    await markJobFailed(pool, jobId, error?.message || error, logJob);
    throw error;
  } finally {
    await pool.end();
  }
}

run()
  .then(() => {
    parentPort?.postMessage({ ok: true });
  })
  .catch((error) => {
    parentPort?.postMessage({ ok: false, message: error?.message });
    process.exit(1);
  });
