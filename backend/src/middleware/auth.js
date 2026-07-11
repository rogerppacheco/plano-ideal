import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { getAuthUserState } from "../services/userService.js";

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(401).json({
      message: "Não autenticado.",
      code: "UNAUTHORIZED",
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      message: "Token inválido ou expirado.",
      code: "INVALID_TOKEN",
    });
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      message: "Token inválido.",
      code: "INVALID_TOKEN",
    });
  }

  try {
    const user = await getAuthUserState(userId);
    if (!user) {
      return res.status(401).json({
        message: "Usuário não encontrado.",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        message: "Conta inativa. Entre em contato com o administrador.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    const tokenVersion = Number(payload.tv);
    if (!Number.isInteger(tokenVersion) || tokenVersion !== user.token_version) {
      return res.status(401).json({
        message: "Sessão expirada. Faça login novamente.",
        code: "TOKEN_REVOKED",
      });
    }

    req.user = {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      tv: user.token_version,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles) {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!req.user?.role || !allowed.has(req.user.role)) {
      return res.status(403).json({
        message: "Sem permissão para esta ação.",
        code: "FORBIDDEN",
      });
    }
    return next();
  };
}
