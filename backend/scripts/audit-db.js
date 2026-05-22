/**
 * Auditoria do PostgreSQL antes de deploy compartilhado (Record / outros).
 * Uso: node ./scripts/audit-db.js
 * Usa DATABASE_URL do .env (ou variável de ambiente).
 */
import dotenv from "dotenv";
import { createPool, getDbSchema } from "../src/db.js";

dotenv.config();

const PI_TABLES = ["internal_users", "coverage_records", "import_jobs"];

function maskUrl(url) {
  if (!url) return "(não definida)";
  try {
    const u = new URL(url.replace(/^postgresql:/, "postgres:"));
    return `${u.protocol}//${u.username ? "***@" : ""}${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(URL inválida)";
  }
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }

  const pool = createPool(connectionString);
  const targetSchema = getDbSchema();

  try {
    const { rows: metaRows } = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS db_user,
        inet_server_addr()::text AS server_addr,
        version() AS version
    `);
    const meta = metaRows[0];

    const { rows: schemas } = await pool.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND schema_name NOT LIKE 'pg_temp%'
        AND schema_name NOT LIKE 'pg_toast_temp%'
      ORDER BY schema_name
    `);

    const { rows: tables } = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);

    const { rows: piSchema } = await pool.query(
      `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
        ) AS exists
      `,
      [targetSchema]
    );

    const { rows: piTablesInSchema } = await pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
      [targetSchema]
    );

    const hostIsLocal =
      /localhost|127\.0\.0\.1/i.test(connectionString) &&
      !process.env.FORCE_REMOTE_AUDIT;

    console.log("\n=== Auditoria PostgreSQL — Plano Ideal ===\n");
    console.log("Conexão:", maskUrl(connectionString));
    console.log("Ambiente:", hostIsLocal ? "LOCAL (localhost)" : "REMOTO");
    console.log("Banco:", meta.database, "| Usuário:", meta.db_user);
    console.log("Servidor:", meta.server_addr || "(local ou socket)");
    console.log("Versão:", meta.version.split("\n")[0]);
    console.log("\n--- Schemas ---");
    for (const s of schemas) console.log(" ", s.schema_name);

    console.log("\n--- Todas as tabelas (", tables.length, ") ---");
    for (const t of tables) {
      console.log(`  ${t.table_schema}.${t.table_name}`);
    }

    const piNames = new Set(PI_TABLES);
    const piNamedTables = tables.filter(
      (t) => piNames.has(t.table_name) && t.table_schema === targetSchema
    );
    const piNamedInPublic = tables.filter(
      (t) => piNames.has(t.table_name) && t.table_schema === "public"
    );
    const otherTables = tables.filter(
      (t) => !piNames.has(t.table_name) || (piNames.has(t.table_name) && t.table_schema !== targetSchema)
    );

    console.log(`\n--- Tabelas do Plano Ideal em ${targetSchema} ---`);
    if (piNamedTables.length === 0) {
      console.log("  Nenhuma ainda — rode: node ./scripts/setup-schema.js");
    } else {
      for (const c of piNamedTables) {
        console.log(`  ${c.table_schema}.${c.table_name}`);
      }
    }

    if (piNamedInPublic.length > 0) {
      console.log("\n--- ATENÇÃO: nomes do Plano Ideal em public ---");
      for (const c of piNamedInPublic) {
        console.log(`  ${c.table_schema}.${c.table_name}`);
      }
    }

    console.log("\n--- Outras tabelas (ex.: Record em public) ---");
    const othersOnly = otherTables.filter((t) => !(piNames.has(t.table_name) && t.table_schema === targetSchema));
    if (othersOnly.length === 0) {
      console.log("  Nenhuma listada além do schema do Plano Ideal.");
    } else {
      console.log(`  Total: ${othersOnly.length} (mostrando até 15)`);
      for (const t of othersOnly.slice(0, 15)) {
        console.log(`  ${t.table_schema}.${t.table_name}`);
      }
      if (othersOnly.length > 15) console.log(`  ... e mais ${othersOnly.length - 15}`);
    }

    console.log(`\n--- Schema ${targetSchema} (Plano Ideal) ---`);
    console.log("  Existe:", piSchema[0].exists ? "sim" : "não");
    if (piTablesInSchema.length) {
      console.log("  Tabelas:", piTablesInSchema.map((r) => r.table_name).join(", "));
    }

    console.log("\n--- Recomendação ---");
    if (piNamedInPublic.length > 0) {
      console.log("  RISCO: tabelas do Plano Ideal em public colidem com o CRM. Use só o schema dedicado.");
    } else if (piNamedTables.length >= PI_TABLES.length) {
      console.log(`  Pronto: Plano Ideal isolado em ${targetSchema}. Pode subir a API com DB_SCHEMA=${targetSchema}.`);
    } else if (othersOnly.length > 0 && piNamedTables.length === 0) {
      console.log(`  BOM: CRM em public, Plano Ideal ainda não em ${targetSchema}. Rode setup-schema.js.`);
    } else {
      console.log("  Revise a lista acima antes do deploy.");
    }
    console.log("");
  } catch (error) {
    console.error("Falha na conexão:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
