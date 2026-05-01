import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { pool } from "../src/db.js";

dotenv.config();

async function run() {
  const users = [
    {
      username: "admin",
      password: "admin123",
      role: "admin",
      fullName: "Administrador",
    },
    {
      username: "vendedor",
      password: "vendedor123",
      role: "vendedor",
      fullName: "Vendedor",
    },
  ];

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    await pool.query(
      `
        INSERT INTO internal_users (username, password_hash, role, full_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (username)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          full_name = EXCLUDED.full_name
      `,
      [user.username, hash, user.role, user.fullName]
    );
  }

  // eslint-disable-next-line no-console
  console.log("Usuários internos criados/atualizados com sucesso.");
  await pool.end();
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("Falha ao criar usuários:", error);
  await pool.end();
  process.exit(1);
});
