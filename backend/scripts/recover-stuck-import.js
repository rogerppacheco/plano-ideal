/**
 * Marca como concluído um job travado (linhas 100% no contador, status processing).
 * Uso: node ./scripts/recover-stuck-import.js [jobId]
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../src/db.js";
import { recoverStuckJob } from "../src/services/importJobRecovery.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const jobId = Number(process.argv[2] || 0);
if (!jobId) {
  console.error("Uso: node ./scripts/recover-stuck-import.js <jobId>");
  process.exit(1);
}

const pool = createPool();
const result = await recoverStuckJob(pool, jobId);
await pool.end();

if (result.action === "completed") {
  console.log(`Job #${jobId} marcado como concluído.`, result.job);
} else if (result.action === "failed") {
  console.log(`Job #${jobId} marcado como falha.`, result.job);
} else {
  console.log(`Job #${jobId} não foi alterado (status ou contadores).`, result.job);
  process.exit(1);
}
