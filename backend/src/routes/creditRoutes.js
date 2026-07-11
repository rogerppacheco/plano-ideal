import express from "express";
import { canViewAllCreditHistory } from "../constants/roles.js";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { checkCreditRateLimit, hasAvailableBoCredential } from "../services/creditRateLimit.js";
import { validateDocument, maskDocument } from "../utils/documentValidation.js";

const router = express.Router();

function mapConsultation(row) {
  return {
    id: row.id,
    document: row.document,
    documentMasked: maskDocument(row.document),
    cpfRepresentative: row.cpf_representative,
    status: row.status,
    approved: row.approved,
    resultDetail: row.result_detail,
    errorMessage: row.error_message,
    hasScreenshot: Boolean(row.has_screenshot ?? row.screenshot_base64),
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    papTtMatricula: row.pap_tt_matricula,
    requestedBy: row.requested_by,
    requesterName: row.requester_name,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

router.post("/credit/consult", requireAuth, async (req, res) => {
  const { document, cpfRepresentative } = req.body || {};
  const validation = validateDocument(document, cpfRepresentative);
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  const rate = await checkCreditRateLimit(req.user.sub);
  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  const boAvailable = await hasAvailableBoCredential();
  if (!boAvailable) {
    return res.status(503).json({
      message: "Todos os logins PAP estão em uso. Tente novamente em alguns instantes.",
    });
  }

  const insertQuery = `
    INSERT INTO credit_consultations (requested_by, document, cpf_representative, status)
    VALUES ($1, $2, $3, 'queued')
    RETURNING id, document, cpf_representative, status, created_at
  `;
  const { rows } = await pool.query(insertQuery, [
    req.user.sub,
    validation.document,
    validation.cpfRepresentative,
  ]);

  return res.status(202).json({ consultation: mapConsultation(rows[0]) });
});

router.get("/credit/consultations", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const viewAll = canViewAllCreditHistory(req.user.role);
  const query = `
    SELECT c.id, c.document, c.cpf_representative, c.status, c.approved,
           c.result_detail, c.error_message, c.duration_seconds, c.pap_tt_matricula,
           c.requested_by, c.created_at, c.started_at, c.finished_at,
           (c.screenshot_base64 IS NOT NULL AND c.screenshot_base64 <> '') AS has_screenshot,
           u.full_name AS requester_name
    FROM credit_consultations c
    JOIN internal_users u ON u.id = c.requested_by
    WHERE ($1::boolean OR c.requested_by = $2)
    ORDER BY c.created_at DESC
    LIMIT $3
  `;
  const { rows } = await pool.query(query, [viewAll, req.user.sub, limit]);
  return res.json({ consultations: rows.map(mapConsultation) });
});

router.get("/credit/consultations/:id", requireAuth, async (req, res) => {
  const viewAll = canViewAllCreditHistory(req.user.role);
  const query = `
    SELECT c.id, c.document, c.cpf_representative, c.status, c.approved,
           c.result_detail, c.error_message, c.duration_seconds, c.pap_tt_matricula,
           c.requested_by, c.created_at, c.started_at, c.finished_at,
           (c.screenshot_base64 IS NOT NULL AND c.screenshot_base64 <> '') AS has_screenshot,
           u.full_name AS requester_name
    FROM credit_consultations c
    JOIN internal_users u ON u.id = c.requested_by
    WHERE c.id = $1
      AND ($2::boolean OR c.requested_by = $3)
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [req.params.id, viewAll, req.user.sub]);
  if (!rows[0]) {
    return res.status(404).json({ message: "Consulta não encontrada." });
  }
  return res.json({ consultation: mapConsultation(rows[0]) });
});

router.get("/credit/consultations/:id/screenshot", requireAuth, async (req, res) => {
  const viewAll = canViewAllCreditHistory(req.user.role);
  const query = `
    SELECT c.screenshot_base64, c.requested_by
    FROM credit_consultations c
    WHERE c.id = $1
      AND ($2::boolean OR c.requested_by = $3)
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [req.params.id, viewAll, req.user.sub]);
  if (!rows[0]?.screenshot_base64) {
    return res.status(404).json({ message: "Comprovante não disponível." });
  }
  return res.json({ screenshotBase64: rows[0].screenshot_base64 });
});

export default router;
