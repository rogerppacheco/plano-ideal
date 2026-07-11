import { pool } from "../db.js";
import { insertAuditLog } from "./auditService.js";

export class PartnerServiceError extends Error {
  constructor(message, status = 400, code = "PARTNER_ERROR") {
    super(message);
    this.name = "PartnerServiceError";
    this.status = status;
    this.code = code;
  }
}

function parsePartnerId(partnerId) {
  const id = Number(partnerId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PartnerServiceError("ID de parceiro inválido.");
  }
  return id;
}

export function slugifyPartner(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toPublicPartner(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    contactEmail: row.contact_email ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeKeyCount: row.active_key_count != null ? Number(row.active_key_count) : undefined,
  };
}

export async function listPartners() {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.slug,
      p.contact_email,
      p.is_active,
      p.created_at,
      p.updated_at,
      COUNT(ak.id) FILTER (
        WHERE ak.is_active = TRUE AND ak.revoked_at IS NULL
      )::int AS active_key_count
    FROM partners p
    LEFT JOIN api_keys ak ON ak.partner_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC, p.id DESC
  `);

  return rows.map(toPublicPartner);
}

export async function getPartnerById(partnerId) {
  const id = parsePartnerId(partnerId);
  const { rows } = await pool.query(
    `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.contact_email,
        p.is_active,
        p.created_at,
        p.updated_at,
        COUNT(ak.id) FILTER (
          WHERE ak.is_active = TRUE AND ak.revoked_at IS NULL
        )::int AS active_key_count
      FROM partners p
      LEFT JOIN api_keys ak ON ak.partner_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
      LIMIT 1
    `,
    [id]
  );

  return toPublicPartner(rows[0]);
}

export async function createPartner({ actorUserId, name, slug, contactEmail }) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    throw new PartnerServiceError("Nome do parceiro é obrigatório.");
  }

  const normalizedSlug = slugifyPartner(slug || normalizedName);
  if (!normalizedSlug || normalizedSlug.length < 2) {
    throw new PartnerServiceError("Slug inválido. Use ao menos 2 caracteres alfanuméricos.");
  }

  const normalizedEmail = String(contactEmail || "").trim() || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
        INSERT INTO partners (name, slug, contact_email, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, slug, contact_email, is_active, created_at, updated_at
      `,
      [normalizedName, normalizedSlug, normalizedEmail, actorUserId]
    );

    const partner = rows[0];
    await insertAuditLog(client, {
      actorUserId,
      action: "PARTNER_CREATED",
      partnerId: partner.id,
      metadata: { name: partner.name, slug: partner.slug },
    });

    await client.query("COMMIT");
    return toPublicPartner(partner);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      throw new PartnerServiceError("Slug de parceiro já existe.", 409, "PARTNER_SLUG_CONFLICT");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePartner({ actorUserId, partnerId, name, contactEmail, isActive }) {
  const id = parsePartnerId(partnerId);
  const current = await getPartnerById(id);
  if (!current) {
    throw new PartnerServiceError("Parceiro não encontrado.", 404, "PARTNER_NOT_FOUND");
  }

  const nextName = name !== undefined ? String(name).trim() : current.name;
  const nextEmail =
    contactEmail !== undefined ? String(contactEmail || "").trim() || null : current.contactEmail;
  const nextActive = isActive !== undefined ? Boolean(isActive) : current.isActive;

  if (!nextName) {
    throw new PartnerServiceError("Nome do parceiro é obrigatório.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
        UPDATE partners
        SET name = $2,
            contact_email = $3,
            is_active = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, slug, contact_email, is_active, created_at, updated_at
      `,
      [id, nextName, nextEmail, nextActive]
    );

    const partner = rows[0];
    await insertAuditLog(client, {
      actorUserId,
      action: "PARTNER_UPDATED",
      partnerId: partner.id,
      metadata: {
        name: partner.name,
        isActive: partner.is_active,
        contactEmail: partner.contact_email,
      },
    });

    await client.query("COMMIT");
    return toPublicPartner(partner);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function handlePartnerServiceError(error, res) {
  if (error instanceof PartnerServiceError) {
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
    });
  }
  throw error;
}
