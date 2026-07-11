import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

async function checkPool(label, config) {
  const pool = new pg.Pool(config);
  const pathRes = await pool.query("SHOW search_path");
  console.log(`\n=== ${label} search_path:`, pathRes.rows[0]?.search_path);

  for (const tableRef of [
    "internal_users",
    "plano_ideal.internal_users",
    "public.internal_users",
  ]) {
    try {
      const { rows } = await pool.query(
        `SELECT id, username, role, password_hash FROM ${tableRef} WHERE username = 'admin' LIMIT 1`
      );
      if (!rows[0]) {
        console.log(tableRef, "sem admin");
        continue;
      }
      const user = rows[0];
      console.log(tableRef, {
        id: user.id,
        role: user.role,
        admin123: await bcrypt.compare("admin123", user.password_hash),
        Inovamg26: await bcrypt.compare("Inovamg26", user.password_hash),
      });
    } catch (error) {
      console.log(tableRef, "erro:", error.message);
    }
  }
  await pool.end();
}

await checkPool("Railway-like pool", {
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=plano_ideal",
  ssl: { rejectUnauthorized: false },
});

await checkPool("Sem search_path", {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
