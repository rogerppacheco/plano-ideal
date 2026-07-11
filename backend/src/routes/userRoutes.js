import express from "express";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createUser,
  deleteUser,
  handleUserServiceError,
  listUsers,
  setUserActive,
  updateUser,
  updateUserPassword,
} from "../services/userService.js";

const router = express.Router();

router.get("/users", requireAuth, requireRole(ROLES.ADMIN), async (_req, res) => {
  const users = await listUsers();
  return res.json({ users });
});

router.post("/users", requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const user = await createUser({
      actorUserId: req.user.sub,
      username: req.body?.username,
      fullName: req.body?.fullName,
      role: req.body?.role,
      password: req.body?.password,
    });
    return res.status(201).json({ user });
  } catch (error) {
    return handleUserServiceError(error, res);
  }
});

router.patch("/users/:id", requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "ID de usuário inválido." });
  }

  try {
    const user = await updateUser({
      actorUserId: req.user.sub,
      userId,
      fullName: req.body?.fullName,
      role: req.body?.role,
    });
    return res.json({ user, message: "Usuário atualizado com sucesso." });
  } catch (error) {
    return handleUserServiceError(error, res);
  }
});

router.patch("/users/:id/password", requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  const userId = Number(req.params.id);
  try {
    const user = await updateUserPassword({
      actorUserId: req.user.sub,
      userId,
      password: req.body?.password,
    });
    return res.json({ user, message: "Senha atualizada com sucesso." });
  } catch (error) {
    return handleUserServiceError(error, res);
  }
});

router.patch("/users/:id/status", requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "ID de usuário inválido." });
  }

  try {
    const user = await setUserActive({
      actorUserId: req.user.sub,
      userId,
      isActive: req.body?.isActive,
    });
    const message = user.isActive
      ? "Usuário reativado com sucesso."
      : "Usuário inativado com sucesso.";
    return res.json({ user, message });
  } catch (error) {
    return handleUserServiceError(error, res);
  }
});

router.delete("/users/:id", requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "ID de usuário inválido." });
  }

  try {
    const result = await deleteUser({ actorUserId: req.user.sub, userId });
    return res.json({ ...result, message: "Usuário excluído permanentemente." });
  } catch (error) {
    return handleUserServiceError(error, res);
  }
});

export default router;
