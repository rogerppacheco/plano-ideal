import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { isValidRole, ROLES } from "../constants/roles.js";
import { insertAuditLog } from "./auditService.js";

export class UserServiceError extends Error {
  constructor(message, status = 400, code = "USER_ERROR") {
    super(message);
    this.name = "UserServiceError";
    this.status = status;
    this.code = code;
  }
}

function parseUserId(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new UserServiceError("ID de usuário inválido.");
  }
  return id;
}

const PUBLIC_USER_COLUMNS = `
  id, username, full_name, role, is_active, last_login_at, created_at, updated_at
`;

export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    full_name: row.full_name,
    name: row.full_name,
    role: row.role,
    isActive: row.is_active,
    is_active: row.is_active,
    lastLoginAt: row.last_login_at,
    last_login_at: row.last_login_at,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
  };
}

export async function listUsers() {
  const { rows } = await pool.query(`
    SELECT ${PUBLIC_USER_COLUMNS}
    FROM internal_users
    ORDER BY created_at DESC, id DESC
  `);
  return rows.map(toPublicUser);
}

export async function getUserById(userId) {
  const id = parseUserId(userId);
  const { rows } = await pool.query(
    `
      SELECT ${PUBLIC_USER_COLUMNS}
      FROM internal_users
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return toPublicUser(rows[0]);
}

async function getUserForMutation(client, userId) {
  const id = parseUserId(userId);
  const { rows } = await client.query(
    `
      SELECT id, username, full_name, role, is_active, token_version
      FROM internal_users
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return rows[0] ?? null;
}

async function countActiveAdmins(client, excludeUserId = null) {
  const { rows } = await client.query(
    `
      SELECT COUNT(*)::int AS total
      FROM internal_users
      WHERE role = $1
        AND is_active = TRUE
        AND ($2::int IS NULL OR id <> $2)
    `,
    [ROLES.ADMIN, excludeUserId]
  );
  return rows[0]?.total ?? 0;
}

function assertNotSelf(actorId, targetId, message) {
  if (Number(actorId) === Number(targetId)) {
    throw new UserServiceError(message, 400, "SELF_ACTION_FORBIDDEN");
  }
}

async function assertAdminSurvival(client, targetUser) {
  if (targetUser.role !== ROLES.ADMIN || !targetUser.is_active) return;

  const remaining = await countActiveAdmins(client, targetUser.id);
  if (remaining < 1) {
    throw new UserServiceError(
      "Não é possível remover ou inativar o último administrador ativo.",
      409,
      "LAST_ADMIN_PROTECTED"
    );
  }
}

export async function createUser({ actorUserId, username, fullName, role, password }) {
  const normalizedUsername = String(username || "").trim();
  const normalizedFullName = String(fullName || "").trim();
  const normalizedRole = String(role || "").trim();
  const rawPassword = String(password || "");

  if (!normalizedUsername || !normalizedFullName || !normalizedRole || !rawPassword) {
    throw new UserServiceError("Usuário, nome, perfil e senha são obrigatórios.");
  }
  if (!isValidRole(normalizedRole)) {
    throw new UserServiceError("Perfil inválido. Use admin, manager ou operator.");
  }
  if (rawPassword.length < 6) {
    throw new UserServiceError("Senha deve ter ao menos 6 caracteres.");
  }

  const passwordHash = await bcrypt.hash(rawPassword, 10);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
        INSERT INTO internal_users (username, password_hash, role, full_name)
        VALUES ($1, $2, $3, $4)
        RETURNING ${PUBLIC_USER_COLUMNS}
      `,
      [normalizedUsername, passwordHash, normalizedRole, normalizedFullName]
    );
    const user = rows[0];

    await insertAuditLog(client, {
      actorUserId,
      action: "USER_CREATED",
      targetUserId: user.id,
      metadata: { username: user.username, role: user.role, fullName: user.full_name },
    });

    await client.query("COMMIT");
    return toPublicUser(user);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      throw new UserServiceError("Nome de usuário já existe.", 409, "USERNAME_CONFLICT");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUser({ actorUserId, userId, fullName, role }) {
  const id = parseUserId(userId);
  const target = await getUserById(id);
  if (!target) {
    throw new UserServiceError("Usuário não encontrado.", 404, "USER_NOT_FOUND");
  }

  const nextFullName = fullName !== undefined ? String(fullName).trim() : target.fullName;
  const nextRole = role !== undefined ? String(role).trim() : target.role;

  if (!nextFullName) {
    throw new UserServiceError("Nome completo é obrigatório.");
  }
  if (!isValidRole(nextRole)) {
    throw new UserServiceError("Perfil inválido. Use admin, manager ou operator.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await getUserForMutation(client, id);
    if (!current) {
      throw new UserServiceError("Usuário não encontrado.", 404, "USER_NOT_FOUND");
    }

    if (current.role === ROLES.ADMIN && nextRole !== ROLES.ADMIN && current.is_active) {
      await assertAdminSurvival(client, current);
    }

    const roleChanged = current.role !== nextRole;
    const { rows } = await client.query(
      `
        UPDATE internal_users
        SET full_name = $1,
            role = $2,
            updated_at = NOW(),
            token_version = token_version + CASE WHEN $3 THEN 1 ELSE 0 END
        WHERE id = $4
        RETURNING ${PUBLIC_USER_COLUMNS}
      `,
      [nextFullName, nextRole, roleChanged, id]
    );

    await insertAuditLog(client, {
      actorUserId,
      action: "USER_UPDATED",
      targetUserId: id,
      metadata: {
        previousRole: current.role,
        newRole: nextRole,
        previousFullName: current.full_name,
        newFullName: nextFullName,
        roleChanged,
      },
    });

    await client.query("COMMIT");
    return toPublicUser(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserPassword({ actorUserId, userId, password }) {
  const id = parseUserId(userId);
  const rawPassword = String(password || "");
  if (rawPassword.length < 6) {
    throw new UserServiceError("Senha deve ter ao menos 6 caracteres.");
  }

  const passwordHash = await bcrypt.hash(rawPassword, 10);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const current = await getUserForMutation(client, id);
    if (!current) {
      throw new UserServiceError("Usuário não encontrado.", 404, "USER_NOT_FOUND");
    }

    const { rows } = await client.query(
      `
        UPDATE internal_users
        SET password_hash = $1,
            updated_at = NOW(),
            token_version = token_version + 1
        WHERE id = $2
        RETURNING ${PUBLIC_USER_COLUMNS}
      `,
      [passwordHash, id]
    );

    await insertAuditLog(client, {
      actorUserId,
      action: "USER_PASSWORD_CHANGED",
      targetUserId: id,
      metadata: { username: current.username },
    });

    await client.query("COMMIT");
    return toPublicUser(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setUserActive({ actorUserId, userId, isActive }) {
  const id = parseUserId(userId);
  if (typeof isActive !== "boolean") {
    throw new UserServiceError("Campo isActive deve ser booleano.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await getUserForMutation(client, id);
    if (!current) {
      throw new UserServiceError("Usuário não encontrado.", 404, "USER_NOT_FOUND");
    }

    if (isActive === current.is_active) {
      await client.query("ROLLBACK");
      return toPublicUser(await getUserById(id));
    }

    if (!isActive) {
      assertNotSelf(actorUserId, id, "Você não pode inativar a própria conta.");
      await assertAdminSurvival(client, current);
    }

    const { rows } = await client.query(
      `
        UPDATE internal_users
        SET is_active = $1,
            updated_at = NOW(),
            token_version = token_version + CASE WHEN $1 = FALSE THEN 1 ELSE 0 END
        WHERE id = $2
        RETURNING ${PUBLIC_USER_COLUMNS}
      `,
      [isActive, id]
    );

    await insertAuditLog(client, {
      actorUserId,
      action: isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
      targetUserId: id,
      metadata: { username: current.username, role: current.role },
    });

    await client.query("COMMIT");
    return toPublicUser(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteUser({ actorUserId, userId }) {
  const id = parseUserId(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await getUserForMutation(client, id);
    if (!current) {
      throw new UserServiceError("Usuário não encontrado.", 404, "USER_NOT_FOUND");
    }

    assertNotSelf(actorUserId, id, "Você não pode excluir a própria conta.");
    await assertAdminSurvival(client, current);

    const { rows: creditRows } = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM credit_consultations
          WHERE requested_by = $1
          LIMIT 1
        ) AS has_history
      `,
      [id]
    );
    if (creditRows[0]?.has_history) {
      throw new UserServiceError(
        "Usuário possui histórico de consultas de crédito. Use inativação em vez de exclusão.",
        409,
        "CREDIT_HISTORY_BLOCKED"
      );
    }

    await insertAuditLog(client, {
      actorUserId,
      action: "USER_DELETED",
      targetUserId: id,
      metadata: {
        username: current.username,
        fullName: current.full_name,
        role: current.role,
      },
    });

    await client.query(`DELETE FROM internal_users WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return { deleted: true, id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordSuccessfulLogin({ userId, actorUserId = userId }) {
  const id = parseUserId(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
        UPDATE internal_users
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND is_active = TRUE
        RETURNING id
      `,
      [id]
    );
    if (!rows.length) {
      throw new UserServiceError("Conta inativa.", 403, "ACCOUNT_INACTIVE");
    }

    await insertAuditLog(client, {
      actorUserId: actorUserId ?? id,
      action: "USER_LOGIN",
      targetUserId: id,
      metadata: {},
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAuthUserState(userId) {
  const id = parseUserId(userId);
  const { rows } = await pool.query(
    `
      SELECT id, is_active, token_version, role, username, full_name
      FROM internal_users
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return rows[0] ?? null;
}

export function handleUserServiceError(error, res) {
  if (error instanceof UserServiceError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  throw error;
}
