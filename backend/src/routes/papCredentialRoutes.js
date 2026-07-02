import express from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { encryptSecret, hasCredentialsSecret } from "../utils/cryptoSecret.js";

const router = express.Router();

function mapCredential(row) {
  return {
    id: row.id,
    label: row.label,
    matriculaPap: row.matricula_pap,
    enabled: row.enabled,
    inUse: Boolean(row.in_use_by),
    lockedAt: row.locked_at,
    createdAt: row.created_at,
  };
}

router.get("/pap/credentials", requireAuth, requireRole("admin"), async (_req, res) => {
  const query = `
    SELECT id, label, matricula_pap, enabled, in_use_by, locked_at, created_at
    FROM pap_bo_credentials
    ORDER BY id ASC
  `;
  const { rows } = await pool.query(query);
  return res.json({ credentials: rows.map(mapCredential) });
});

router.post("/pap/credentials", requireAuth, requireRole("admin"), async (req, res) => {
  if (!hasCredentialsSecret()) {
    return res.status(500).json({
      message: "Configure PAP_CREDENTIALS_SECRET no servidor antes de cadastrar logins.",
    });
  }

  const label = String(req.body?.label || "").trim();
  const matriculaPap = String(req.body?.matriculaPap || req.body?.matricula_pap || "").trim();
  const senhaPap = String(req.body?.senhaPap || req.body?.senha_pap || "");

  if (!label || !matriculaPap || !senhaPap) {
    return res.status(400).json({ message: "Label, matrícula PAP e senha são obrigatórios." });
  }

  const encrypted = encryptSecret(senhaPap);
  const query = `
    INSERT INTO pap_bo_credentials (label, matricula_pap, senha_pap_encrypted, enabled)
    VALUES ($1, $2, $3, true)
    RETURNING id, label, matricula_pap, enabled, in_use_by, locked_at, created_at
  `;
  const { rows } = await pool.query(query, [label, matriculaPap, encrypted]);
  return res.status(201).json({ credential: mapCredential(rows[0]) });
});

router.patch("/pap/credentials/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const label = req.body?.label != null ? String(req.body.label).trim() : null;
  const matriculaPap =
    req.body?.matriculaPap != null
      ? String(req.body.matriculaPap).trim()
      : req.body?.matricula_pap != null
        ? String(req.body.matricula_pap).trim()
        : null;
  const senhaPap =
    req.body?.senhaPap != null
      ? String(req.body.senhaPap)
      : req.body?.senha_pap != null
        ? String(req.body.senha_pap)
        : null;
  const enabled = req.body?.enabled;

  const fields = [];
  const values = [];
  let idx = 1;

  if (label) {
    fields.push(`label = $${idx++}`);
    values.push(label);
  }
  if (matriculaPap) {
    fields.push(`matricula_pap = $${idx++}`);
    values.push(matriculaPap);
  }
  if (senhaPap) {
    if (!hasCredentialsSecret()) {
      return res.status(500).json({ message: "PAP_CREDENTIALS_SECRET não configurada." });
    }
    fields.push(`senha_pap_encrypted = $${idx++}`);
    values.push(encryptSecret(senhaPap));
  }
  if (typeof enabled === "boolean") {
    fields.push(`enabled = $${idx++}`);
    values.push(enabled);
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }

  values.push(id);
  const query = `
    UPDATE pap_bo_credentials
    SET ${fields.join(", ")}
    WHERE id = $${idx}
    RETURNING id, label, matricula_pap, enabled, in_use_by, locked_at, created_at
  `;
  const { rows } = await pool.query(query, values);
  if (!rows[0]) {
    return res.status(404).json({ message: "Credencial não encontrada." });
  }
  return res.json({ credential: mapCredential(rows[0]) });
});

router.delete("/pap/credentials/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await pool.query(
    `DELETE FROM pap_bo_credentials WHERE id = $1 AND in_use_by IS NULL`,
    [id]
  );
  if (!rowCount) {
    return res.status(404).json({ message: "Credencial não encontrada ou em uso." });
  }
  return res.json({ ok: true });
});

router.get("/pap/tt-matriculas", requireAuth, requireRole("admin"), async (_req, res) => {
  const query = `
    SELECT m.id, m.matricula, m.enabled, m.created_at,
           COALESCE(u.consultas, 0) AS consultas_hoje
    FROM pap_tt_matriculas m
    LEFT JOIN pap_tt_daily_usage u
      ON u.matricula = m.matricula AND u.usage_date = CURRENT_DATE
    ORDER BY m.id ASC
  `;
  const { rows } = await pool.query(query);
  return res.json({ matriculas: rows });
});

router.post("/pap/tt-matriculas", requireAuth, requireRole("admin"), async (req, res) => {
  const matricula = String(req.body?.matricula || "").trim();
  if (!matricula) {
    return res.status(400).json({ message: "Matrícula TT é obrigatória." });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO pap_tt_matriculas (matricula, enabled) VALUES ($1, true)
       RETURNING id, matricula, enabled, created_at`,
      [matricula]
    );
    return res.status(201).json({ matricula: rows[0] });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Matrícula TT já cadastrada." });
    }
    throw error;
  }
});

router.patch("/pap/tt-matriculas/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const enabled = req.body?.enabled;
  const matricula = req.body?.matricula != null ? String(req.body.matricula).trim() : null;

  const fields = [];
  const values = [];
  let idx = 1;
  if (matricula) {
    fields.push(`matricula = $${idx++}`);
    values.push(matricula);
  }
  if (typeof enabled === "boolean") {
    fields.push(`enabled = $${idx++}`);
    values.push(enabled);
  }
  if (!fields.length) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE pap_tt_matriculas SET ${fields.join(", ")} WHERE id = $${idx}
     RETURNING id, matricula, enabled, created_at`,
    values
  );
  if (!rows[0]) {
    return res.status(404).json({ message: "Matrícula TT não encontrada." });
  }
  return res.json({ matricula: rows[0] });
});

router.delete("/pap/tt-matriculas/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM pap_tt_matriculas WHERE id = $1`, [
    Number(req.params.id),
  ]);
  if (!rowCount) {
    return res.status(404).json({ message: "Matrícula TT não encontrada." });
  }
  return res.json({ ok: true });
});

export default router;
