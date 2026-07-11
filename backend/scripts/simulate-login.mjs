import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db.js";
import { getUserById, recordSuccessfulLogin } from "../src/services/userService.js";
import jwt from "jsonwebtoken";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

async function tryLogin(username, password) {
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, role, full_name, is_active, token_version
     FROM internal_users WHERE username = $1 LIMIT 1`,
    [username]
  );
  const user = rows[0];
  if (!user) return { ok: false, step: "user-not-found" };
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { ok: false, step: "invalid-password" };
  await recordSuccessfulLogin({ userId: user.id });
  const token = jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      tv: user.token_version,
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
  const refreshed = await getUserById(user.id);
  return {
    ok: true,
    step: "success",
    token: token.slice(0, 20) + "...",
    user: refreshed?.username,
  };
}

for (const pwd of ["admin123", "Inovamg26", "wrongpass"]) {
  try {
    const result = await tryLogin("admin", pwd);
    console.log(pwd, result);
  } catch (error) {
    console.log(pwd, "ERROR", error.message);
  }
}

await pool.end();
