/**
 * Atualiza senha do admin no banco de produção (.env.railway).
 * Uso: node scripts/set-admin-password.mjs "NovaSenhaSegura123"
 */
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const railwayEnv = path.join(root, ".env.railway");
if (!fs.existsSync(railwayEnv)) {
  throw new Error(".env.railway não encontrado");
}
dotenv.config({ path: railwayEnv, override: true });

const newPassword = process.argv[2];
if (!newPassword || newPassword.length < 6) {
  console.error('Uso: node scripts/set-admin-password.mjs "senha-min-6-chars"');
  process.exit(1);
}

const hash = await bcrypt.hash(newPassword, 10);
const { rows } = await pool.query(
  `
    UPDATE internal_users
    SET password_hash = $1,
        token_version = token_version + 1,
        updated_at = NOW()
    WHERE username = 'admin'
    RETURNING id, username, token_version
  `,
  [hash]
);

if (!rows.length) {
  throw new Error("Usuário admin não encontrado.");
}

console.log(`Senha do admin atualizada. token_version=${rows[0].token_version}`);
await pool.end();
