import bcrypt from "bcryptjs";
import express from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/users", requireAuth, requireRole("admin"), async (_req, res) => {
  const query = `
    SELECT id, username, full_name, role, created_at
    FROM internal_users
    ORDER BY created_at DESC, id DESC
  `;
  const { rows } = await pool.query(query);
  return res.json({ users: rows });
});

router.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const { username, fullName, role, password } = req.body || {};
  const normalizedUsername = String(username || "").trim();
  const normalizedFullName = String(fullName || "").trim();
  const normalizedRole = String(role || "").trim();
  const rawPassword = String(password || "");

  if (!normalizedUsername || !normalizedFullName || !normalizedRole || !rawPassword) {
    return res.status(400).json({ message: "Usuário, nome, perfil e senha são obrigatórios." });
  }
  if (!["admin", "vendedor"].includes(normalizedRole)) {
    return res.status(400).json({ message: "Perfil inválido. Use admin ou vendedor." });
  }
  if (rawPassword.length < 6) {
    return res.status(400).json({ message: "Senha deve ter ao menos 6 caracteres." });
  }

  const passwordHash = await bcrypt.hash(rawPassword, 10);

  try {
    const insertQuery = `
      INSERT INTO internal_users (username, password_hash, role, full_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, full_name, role, created_at
    `;
    const { rows } = await pool.query(insertQuery, [
      normalizedUsername,
      passwordHash,
      normalizedRole,
      normalizedFullName,
    ]);
    return res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Nome de usuário já existe." });
    }
    throw error;
  }
});

export default router;
