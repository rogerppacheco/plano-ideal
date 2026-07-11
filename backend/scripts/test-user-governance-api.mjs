/**
 * Smoke test da governança de usuários (requer DB + seed).
 * Uso: node ./scripts/test-user-governance-api.mjs
 */
import dotenv from "dotenv";
import { pool } from "../src/db.js";
import {
  createUser,
  deleteUser,
  getAuthUserState,
  setUserActive,
  updateUserPassword,
} from "../src/services/userService.js";

dotenv.config();

async function run() {
  const admin = await pool.query(
    `SELECT id FROM internal_users WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1`
  );
  const adminId = admin.rows[0]?.id;
  if (!adminId) {
    throw new Error("Nenhum admin ativo encontrado. Rode seed-users.js primeiro.");
  }

  const created = await createUser({
    actorUserId: adminId,
    username: `test_gov_${Date.now()}`,
    fullName: "Teste Governança",
    role: "operator",
    password: "teste123",
  });
  console.log("createUser OK:", created.username, created.role);

  const state = await getAuthUserState(created.id);
  console.log("auth state:", { is_active: state.is_active, token_version: state.token_version });

  await updateUserPassword({
    actorUserId: adminId,
    userId: created.id,
    password: "nova1234",
  });
  const afterPwd = await getAuthUserState(created.id);
  console.log("password bump token_version:", afterPwd.token_version);

  await setUserActive({ actorUserId: adminId, userId: created.id, isActive: false });
  const afterInactive = await getAuthUserState(created.id);
  console.log("inactive:", afterInactive.is_active, "tv:", afterInactive.token_version);

  await deleteUser({ actorUserId: adminId, userId: created.id });
  console.log("hard delete OK");

  const audit = await pool.query(
    `SELECT action, COUNT(*)::int AS total FROM audit_logs WHERE target_user_id IS NULL OR target_user_id = $1 GROUP BY action ORDER BY action`,
    [created.id]
  );
  console.log("audit actions (amostra):", audit.rows);
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Falha:", error.message);
    await pool.end();
    process.exit(1);
  });
