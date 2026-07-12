import { pool } from "../db.js";
import { maskDocument } from "../utils/documentValidation.js";

function mapInternalOsConsultation(row) {
  let results = row.results_json ?? [];
  if (typeof results === "string") {
    try {
      results = JSON.parse(results);
    } catch {
      results = [];
    }
  }
  if (!Array.isArray(results)) {
    results = [];
  }

  return {
    id: row.id,
    document: row.document,
    documentMasked: maskDocument(row.document),
    numeroOsFiltro: row.numero_os_filtro,
    status: row.status,
    resultSummary: row.result_summary,
    results,
    resultsCount: results.length,
    errorMessage: row.error_message,
    hasScreenshot: Boolean(row.has_screenshot ?? row.screenshot_base64),
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    requestedBy: row.requested_by,
    requesterName: row.requester_name,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

const INTERNAL_RETURNING = `
  id, document, numero_os_filtro, status, result_summary, results_json,
  error_message, duration_seconds, requested_by, created_at, started_at, finished_at
`;

export async function createInternalOsConsultation({ requestedBy, document, numeroOsFiltro }) {
  const { rows } = await pool.query(
    `
      INSERT INTO os_consultations (requested_by, document, numero_os_filtro, status, source)
      VALUES ($1, $2, $3, 'queued', 'internal')
      RETURNING ${INTERNAL_RETURNING}
    `,
    [requestedBy, document, numeroOsFiltro || null]
  );

  return mapInternalOsConsultation(rows[0]);
}

export async function listInternalOsConsultations({ userId, viewAll, limit }) {
  const { rows } = await pool.query(
    `
      SELECT o.id, o.document, o.numero_os_filtro, o.status, o.result_summary, o.results_json,
             o.error_message, o.duration_seconds, o.requested_by, o.created_at, o.started_at,
             o.finished_at,
             (o.screenshot_base64 IS NOT NULL AND o.screenshot_base64 <> '') AS has_screenshot,
             u.full_name AS requester_name
      FROM os_consultations o
      JOIN internal_users u ON u.id = o.requested_by
      WHERE ($1::boolean OR o.requested_by = $2)
      ORDER BY o.created_at DESC
      LIMIT $3
    `,
    [viewAll, userId, limit]
  );

  return rows.map(mapInternalOsConsultation);
}

export async function getInternalOsConsultationById({ id, userId, viewAll }) {
  const { rows } = await pool.query(
    `
      SELECT o.id, o.document, o.numero_os_filtro, o.status, o.result_summary, o.results_json,
             o.error_message, o.duration_seconds, o.requested_by, o.created_at, o.started_at,
             o.finished_at,
             (o.screenshot_base64 IS NOT NULL AND o.screenshot_base64 <> '') AS has_screenshot,
             u.full_name AS requester_name
      FROM os_consultations o
      JOIN internal_users u ON u.id = o.requested_by
      WHERE o.id = $1
        AND ($2::boolean OR o.requested_by = $3)
      LIMIT 1
    `,
    [id, viewAll, userId]
  );

  return rows[0] ? mapInternalOsConsultation(rows[0]) : null;
}

export async function getInternalOsScreenshot({ id, userId, viewAll }) {
  const { rows } = await pool.query(
    `
      SELECT o.screenshot_base64
      FROM os_consultations o
      WHERE o.id = $1
        AND ($2::boolean OR o.requested_by = $3)
      LIMIT 1
    `,
    [id, viewAll, userId]
  );

  return rows[0]?.screenshot_base64 ?? null;
}

export { mapInternalOsConsultation };
