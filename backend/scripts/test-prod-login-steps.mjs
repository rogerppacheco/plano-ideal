import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=plano_ideal",
  ssl: { rejectUnauthorized: false },
});

const { rows } = await pool.query(
  `SELECT id, username, password_hash, role, full_name, is_active, token_version
   FROM internal_users WHERE username = 'admin' LIMIT 1`
);
const user = rows[0];
console.log("admin found:", !!user, "is_active:", user?.is_active);

const valid = await bcrypt.compare("Inovamg26", user.password_hash);
console.log("Inovamg26 valid:", valid);

try {
  await pool.query("BEGIN");
  const update = await pool.query(
    `UPDATE internal_users SET last_login_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND is_active = TRUE RETURNING id`,
    [user.id]
  );
  console.log("update last_login:", update.rows.length > 0);
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
     VALUES ($1, 'USER_LOGIN', $2, '{}'::jsonb)`,
    [user.id, user.id]
  );
  console.log("audit insert: OK");
  await pool.query("COMMIT");
} catch (error) {
  await pool.query("ROLLBACK");
  console.error("transaction ERROR:", error.message);
}

try {
  const refreshed = await pool.query(
    `SELECT id, username, full_name, role, is_active, last_login_at, created_at, updated_at
     FROM internal_users WHERE id = $1`,
    [user.id]
  );
  console.log("getUser columns OK:", refreshed.rows[0]?.username);
} catch (error) {
  console.error("getUser ERROR:", error.message);
}

try {
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
  console.log("jwt OK:", token.slice(0, 24) + "...");
} catch (error) {
  console.error("jwt ERROR:", error.message);
}

await pool.end();
