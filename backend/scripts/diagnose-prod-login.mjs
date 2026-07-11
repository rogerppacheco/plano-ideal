/**
 * Diagnóstico de login em produção (usa DATABASE_URL de .env.railway).
 */
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db.js";
import { recordSuccessfulLogin } from "../src/services/userService.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const railwayEnv = path.join(root, ".env.railway");
if (!fs.existsSync(railwayEnv)) {
  throw new Error(".env.railway não encontrado");
}
dotenv.config({ path: railwayEnv, override: true });

async function run() {
  console.log("DB host:", (process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] || "?");

  const { rows } = await pool.query(
    `SELECT id, username, password_hash, is_active, token_version FROM internal_users WHERE username = 'admin' LIMIT 1`
  );
  const user = rows[0];
  if (!user) {
    throw new Error("admin não encontrado");
  }
  console.log("admin id:", user.id, "active:", user.is_active, "tv:", user.token_version);

  const passwords = ["Inovamg26", "admin123"];
  for (const pwd of passwords) {
    const ok = await bcrypt.compare(pwd, user.password_hash);
    console.log(`senha '${pwd}':`, ok ? "OK" : "inválida");
  }

  const audit = await pool.query(`SELECT to_regclass('plano_ideal.audit_logs') AS audit_table`);
  console.log("audit_logs table:", audit.rows[0]?.audit_table);

  console.log("testando recordSuccessfulLogin...");
  const started = Date.now();
  await recordSuccessfulLogin({ userId: user.id });
  console.log("recordSuccessfulLogin OK em", Date.now() - started, "ms");
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("FALHA:", error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  });
