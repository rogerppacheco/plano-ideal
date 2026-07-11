import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { getUserById, recordSuccessfulLogin, UserServiceError } from "../services/userService.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: "Usuário e senha são obrigatórios." });
    }

    const query = `
      SELECT id, username, password_hash, role, full_name, is_active, token_version
      FROM internal_users
      WHERE username = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [username]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        message: "Credenciais inválidas.",
        code: "INVALID_CREDENTIALS",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        message: "Conta inativa. Entre em contato com o administrador.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        message: "Credenciais inválidas.",
        code: "INVALID_CREDENTIALS",
      });
    }

    try {
      await recordSuccessfulLogin({ userId: user.id });
    } catch (error) {
      if (error instanceof UserServiceError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      throw error;
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Configuração do servidor incompleta (JWT_SECRET).",
        code: "SERVER_MISCONFIGURED",
      });
    }

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

    const refreshedUser = await getUserById(user.id);

    return res.json({
      token,
      user: refreshedUser,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[auth/login] Erro inesperado:", error);
    return res.status(500).json({
      message: "Erro interno ao processar login.",
      code: "LOGIN_FAILED",
    });
  }
});

export default router;
