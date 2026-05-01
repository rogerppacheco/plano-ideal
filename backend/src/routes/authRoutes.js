import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "Usuário e senha são obrigatórios." });
  }

  const query = `
    SELECT id, username, password_hash, role, full_name
    FROM internal_users
    WHERE username = $1
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [username]);
  const user = rows[0];

  if (!user) {
    return res.status(401).json({ message: "Credenciais inválidas." });
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({ message: "Credenciais inválidas." });
  }

  const token = jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.full_name,
    },
  });
});

export default router;
