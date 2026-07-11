/**
 * Aplica e valida a migração de governança de usuários.
 * Uso: node ./scripts/verify-user-governance-schema.js
 */
import dotenv from "dotenv";
import { pool } from "../src/db.js";
import { ensureUserGovernanceSchema } from "../src/initSchema.js";

dotenv.config();

async function run() {
  await pool.query("SET search_path TO plano_ideal");
  await ensureUserGovernanceSchema(pool);

  const columns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'internal_users'
    ORDER BY ordinal_position
  `);

  const auditTable = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'audit_logs'
    ) AS ok
  `);

  const roles = await pool.query(`SELECT DISTINCT role FROM internal_users ORDER BY role`);

  const fkImportJobs = await pool.query(`
    SELECT c.confdeltype AS on_delete
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
    WHERE n.nspname = current_schema()
      AND t.relname = 'import_jobs'
      AND c.contype = 'f'
      AND a.attname = 'created_by'
    LIMIT 1
  `);

  console.log("Colunas internal_users:", columns.rows.map((r) => r.column_name).join(", "));
  console.log("audit_logs existe:", auditTable.rows[0]?.ok);
  console.log("Roles:", roles.rows.map((r) => r.role).join(", ") || "(vazio)");
  console.log("import_jobs.created_by ON DELETE:", fkImportJobs.rows[0]?.on_delete ?? "n/a");
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Falha:", error.message);
    await pool.end();
    process.exit(1);
  });
