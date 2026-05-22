/**
 * Cria schema e tabelas do Plano Ideal (isolado do CRM Record em public).
 * Uso: node ./scripts/setup-schema.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createPool, getDbSchema } from "../src/db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const sqlPath = path.join(__dirname, "..", "sql", "init.sql");
  const sql = await fs.readFile(sqlPath, "utf8");
  const pool = createPool();

  try {
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log(`Schema "${getDbSchema()}" e tabelas criadas/verificadas com sucesso.`);
    // eslint-disable-next-line no-console
    console.log("Próximo passo: node ./scripts/seed-users.js");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Falha no setup do schema:", error.message);
  process.exit(1);
});
