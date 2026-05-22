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
    options: `-c search_path=${schema}`,
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
