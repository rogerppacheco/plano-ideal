import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

export const DEFAULT_DB_SCHEMA = "plano_ideal";

export function getDbSchema() {
  const raw = (process.env.DB_SCHEMA || DEFAULT_DB_SCHEMA).trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw)) {
    throw new Error(`DB_SCHEMA inválido: ${raw}`);
  }
  return raw;
}

function needsSsl(connectionString = "") {
  if (process.env.DATABASE_SSL === "false") return false;
  if (process.env.DATABASE_SSL === "true") return true;
  if (/localhost|127\.0\.0\.1/i.test(connectionString)) return false;
  return /\.(rlwy\.net|railway\.app)/i.test(connectionString);
}

export function createPoolConfig(connectionString = process.env.DATABASE_URL) {
  const schema = getDbSchema();
  const config = {
    connectionString,
    options: `-c search_path=${schema} -c statement_timeout=25000`,
    max: Number(process.env.PG_POOL_MAX || 20),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 8000),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  };
  if (needsSsl(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

export function createPool(connectionString = process.env.DATABASE_URL) {
  return new Pool(createPoolConfig(connectionString));
}

export const pool = createPool();

pool.on("error", (error) => {
  // eslint-disable-next-line no-console
  console.error("[DB] Erro inesperado no pool de conexões:", error);
});

export async function verifyDatabaseConnection() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const schema = getDbSchema();
  let client;

  try {
    client = await pool.connect();
    await client.query("SELECT 1 AS ok");
    await client.query(`SET search_path TO ${schema}`);
    // eslint-disable-next-line no-console
    console.log(`[DB] Conexão estabelecida com sucesso (schema="${schema}").`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[DB] Não foi possível conectar ao PostgreSQL:", error);
    throw error;
  } finally {
    client?.release();
  }
}
