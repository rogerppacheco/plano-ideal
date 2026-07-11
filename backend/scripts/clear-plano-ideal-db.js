/**
 * Apaga SOMENTE os dados do Plano Ideal (schema plano_ideal).
 * NÃO mexe no schema public (Record/CRM).
 *
 * Uso (Railway / produção):
 *   $env:CONFIRM_CLEAR = "SIM"
 *   npm run clear-db
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, getDbSchema } from "../src/db.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

function describeUrl(url = "") {
  try {
    const u = new URL(url.replace(/^postgresql:/, "postgres:"));
    const isLocal = /localhost|127\.0\.0\.1/i.test(u.hostname || "");
    return { isLocal, host: u.hostname, database: u.pathname.replace(/^\//, "") };
  } catch {
    return { isLocal: true, host: "?", database: "?" };
  }
}

const pool = createPool();

async function tableExists(schema, name) {
  const { rows } = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      ) AS ok
    `,
    [schema, name]
  );
  return rows[0].ok;
}

async function countTable(schema, name) {
  const { rows } = await pool.query(`SELECT COUNT(*)::INT AS n FROM ${schema}.${name}`);
  return rows[0].n;
}

async function run() {
  if (process.env.CONFIRM_CLEAR !== "SIM") {
    console.error(`
ERRO: confirmação obrigatória.

No PowerShell:
  $env:CONFIRM_CLEAR = "SIM"
  npm run clear-db

Isso apaga TODAS as linhas de cobertura e histórico de importação em plano_ideal.
Usuários admin/vendedor são mantidos.
`);
    process.exit(1);
  }

  const schema = getDbSchema();
  const conn = describeUrl(process.env.DATABASE_URL);

  console.log(`\n=== Limpar Plano Ideal (${schema}) ===\n`);
  console.log(`Host: ${conn.host} | Banco: ${conn.database}`);

  if (conn.isLocal && process.env.ALLOW_LOCAL_CLEAR !== "SIM") {
    console.error(
      "\nBloqueado: conexão LOCAL. Para limpar localhost use também ALLOW_LOCAL_CLEAR=SIM.\n"
    );
    process.exit(1);
  }

  await pool.query(`SET search_path TO ${schema}`);

  const before = {
    coverage: await countTable(schema, "coverage_records"),
    jobs: await countTable(schema, "import_jobs"),
    files: (await tableExists(schema, "import_job_files"))
      ? await countTable(schema, "import_job_files")
      : 0,
    users: await countTable(schema, "internal_users"),
  };

  console.log("\nAntes:");
  console.log(`  coverage_records: ${before.coverage.toLocaleString("pt-BR")}`);
  console.log(`  import_jobs:      ${before.jobs.toLocaleString("pt-BR")}`);
  console.log(`  import_job_files: ${before.files.toLocaleString("pt-BR")}`);
  console.log(`  internal_users:   ${before.users} (serão mantidos)`);

  const publicCrm = await pool.query(`
    SELECT COUNT(*)::INT AS n
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'crm_%'
  `);
  console.log(`\nCRM Record em public: ${publicCrm.rows[0].n > 0 ? "intocado" : "não detectado"}`);

  const tables = ["coverage_records"];
  if (await tableExists(schema, "import_job_files")) tables.push("import_job_files");
  tables.push("import_jobs");

  await pool.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);

  const after = {
    coverage: await countTable(schema, "coverage_records"),
    jobs: await countTable(schema, "import_jobs"),
  };

  console.log("\nDepois:");
  console.log(`  coverage_records: ${after.coverage}`);
  console.log(`  import_jobs:      ${after.jobs}`);
  console.log("\nConcluído. Schema public (Record) não foi alterado.\n");

  await pool.end();
}

run().catch(async (e) => {
  console.error("Falha:", e.message);
  await pool.end();
  process.exit(1);
});
