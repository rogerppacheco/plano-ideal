import { pool } from "../db.js";
import { maskDocument } from "../utils/documentValidation.js";

function mapInternalConsultation(row) {
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

const INTERNAL_RETURNING = `
  id, document, cpf_representative, status, approved, result_detail, error_message,
  duration_seconds, pap_tt_matricula, requested_by, created_at, started_at, finished_at
`;

export async function createInternalCreditConsultation({
  requestedBy,
  document,
  cpfRepresentative,
}) {
  const { rows } = await pool.query(
    `
      INSERT INTO credit_consultations (requested_by, document, cpf_representative, status, source)
      VALUES ($1, $2, $3, 'queued', 'internal')
      RETURNING ${INTERNAL_RETURNING}
    `,
    [requestedBy, document, cpfRepresentative]
  );

  return mapInternalConsultation(rows[0]);
}

export async function createExternalCreditConsultation({ apiKeyId, document, cpfRepresentative }) {
  const { rows } = await pool.query(
    `
      INSERT INTO credit_consultations (api_key_id, document, cpf_representative, status, source)
      VALUES ($1, $2, $3, 'queued', 'external')
      RETURNING id, document, status, created_at
    `,
    [apiKeyId, document, cpfRepresentative]
  );

  return rows[0];
}

export async function listInternalCreditConsultations({
  userId,
  viewAll,
  limit = 20,
  offset = 0,
  dateFrom = null,
  dateTo = null,
}) {
  const params = [viewAll, userId, dateFrom, dateTo, limit, offset];
  const whereClause = `
      WHERE ($1::boolean OR c.requested_by = $2)
        AND ($3::date IS NULL OR (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= $3::date)
        AND ($4::date IS NULL OR (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= $4::date)
  `;

  const [listResult, countResult] = await Promise.all([
    pool.query(
      `
      SELECT c.id, c.document, c.cpf_representative, c.status, c.approved,
             c.result_detail, c.error_message, c.duration_seconds, c.pap_tt_matricula,
             c.requested_by, c.created_at, c.started_at, c.finished_at,
             (c.screenshot_base64 IS NOT NULL AND c.screenshot_base64 <> '') AS has_screenshot,
             u.full_name AS requester_name
      FROM credit_consultations c
      JOIN internal_users u ON u.id = c.requested_by
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $5 OFFSET $6
    `,
      params
    ),
    pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_consultations c
      JOIN internal_users u ON u.id = c.requested_by
      ${whereClause}
    `,
      [viewAll, userId, dateFrom, dateTo]
    ),
  ]);

  return {
    consultations: listResult.rows.map(mapInternalConsultation),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function getInternalCreditConsultationById({ id, userId, viewAll }) {
  const { rows } = await pool.query(
    `
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
    `,
    [id, viewAll, userId]
  );

  return rows[0] ? mapInternalConsultation(rows[0]) : null;
}

export async function getExternalCreditConsultationById({ id, apiKeyId }) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        document,
        status,
        approved,
        result_detail,
        error_message,
        duration_seconds,
        created_at,
        started_at,
        finished_at
      FROM credit_consultations
      WHERE id = $1
        AND api_key_id = $2
        AND source = 'external'
      LIMIT 1
    `,
    [id, apiKeyId]
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    document_masked: maskDocument(rows[0].document),
  };
}

export async function getInternalCreditScreenshot({ id, userId, viewAll }) {
  const { rows } = await pool.query(
    `
      SELECT c.screenshot_base64
      FROM credit_consultations c
      WHERE c.id = $1
        AND ($2::boolean OR c.requested_by = $3)
      LIMIT 1
    `,
    [id, viewAll, userId]
  );

  return rows[0]?.screenshot_base64 ?? null;
}

export { mapInternalConsultation };
