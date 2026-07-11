import { pool } from "../db.js";
import { EXTERNAL_API_SCOPES } from "../config/externalApiLimits.js";
import { API_KEY_LIVE_PREFIX } from "../utils/apiKeyCrypto.js";
import {
  generateApiKeyMaterial,
  hashApiKey,
  parseApiKeyPlaintext,
  verifyApiKeyHash,
} from "../utils/apiKeyCrypto.js";
import { getPartnerById, PartnerServiceError } from "./partnerService.js";
import { insertAuditLog } from "./auditService.js";

const ALLOWED_SCOPES = new Set(EXTERNAL_API_SCOPES);

export class ApiKeyServiceError extends Error {
  constructor(message, status = 400, code = "API_KEY_ERROR") {
    super(message);
    this.name = "ApiKeyServiceError";
    this.status = status;
    this.code = code;
  }
}

export function toPublicApiKey(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    partnerId: Number(row.partner_id),
    keyPrefix: row.key_prefix,
    displayPrefix: `${API_KEY_LIVE_PREFIX}${row.key_prefix}`,
    name: row.name,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    isActive: row.is_active,
    isRevoked: Boolean(row.revoked_at),
    lastUsedAt: row.last_used_at ?? null,
    expiresAt: row.expires_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
  };
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return [...EXTERNAL_API_SCOPES];
  }

  const normalized = [...new Set(scopes.map((scope) => String(scope).trim()).filter(Boolean))];
  const invalid = normalized.filter((scope) => !ALLOWED_SCOPES.has(scope));
  if (invalid.length > 0) {
    throw new Error(`Scopes inválidos: ${invalid.join(", ")}`);
  }

  return normalized;
}

/**
 * Valida API Key (lookup por prefixo + bcrypt compare).
 * Retorna null se inválida; executa compare dummy em falhas.
 */
export async function validateApiKey(plaintext) {
  const parsed = parseApiKeyPlaintext(plaintext);
  if (!parsed) {
    await verifyApiKeyHash(plaintext, null);
    return null;
  }

  const { rows } = await pool.query(
    `
      SELECT
        ak.id,
        ak.partner_id,
        ak.key_prefix,
        ak.key_hash,
        ak.name,
        ak.scopes,
        ak.is_active,
        ak.expires_at,
        ak.revoked_at,
        p.name AS partner_name,
        p.slug AS partner_slug,
        p.is_active AS partner_is_active
      FROM api_keys ak
      INNER JOIN partners p ON p.id = ak.partner_id
      WHERE ak.key_prefix = $1
        AND ak.is_active = TRUE
        AND ak.revoked_at IS NULL
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    `,
    [parsed.keyPrefix]
  );

  if (rows.length === 0) {
    await verifyApiKeyHash(plaintext, null);
    return null;
  }

  for (const row of rows) {
    const matches = await verifyApiKeyHash(plaintext, row.key_hash);
    if (!matches) continue;

    if (!row.partner_is_active) {
      return null;
    }

    return {
      apiKeyId: Number(row.id),
      partnerId: Number(row.partner_id),
      keyName: row.name,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      partnerName: row.partner_name,
      partnerSlug: row.partner_slug,
    };
  }

  await verifyApiKeyHash(plaintext, null);
  return null;
}

export async function touchApiKeyLastUsed(apiKeyId) {
  await pool.query(
    `
      UPDATE api_keys
      SET last_used_at = NOW()
      WHERE id = $1
    `,
    [apiKeyId]
  );
}

export async function createApiKey({
  partnerId,
  name,
  scopes,
  createdBy = null,
  expiresAt = null,
  actorUserId = null,
}) {
  const partner = await getPartnerById(partnerId);
  if (!partner) {
    throw new ApiKeyServiceError("Parceiro não encontrado.", 404, "PARTNER_NOT_FOUND");
  }
  if (!partner.isActive) {
    throw new ApiKeyServiceError(
      "Parceiro inativo. Reative antes de gerar chaves.",
      409,
      "PARTNER_INACTIVE"
    );
  }

  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    throw new ApiKeyServiceError("Nome da chave é obrigatório.");
  }

  const material = generateApiKeyMaterial();
  const keyHash = await hashApiKey(material.plaintext);
  const normalizedScopes = normalizeScopes(scopes);

  const { rows } = await pool.query(
    `
      INSERT INTO api_keys (
        partner_id,
        key_prefix,
        key_hash,
        name,
        scopes,
        created_by,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5::text[], $6, $7)
      RETURNING
        id, partner_id, key_prefix, name, scopes, is_active,
        last_used_at, expires_at, revoked_at, created_at
    `,
    [partnerId, material.keyPrefix, keyHash, normalizedName, normalizedScopes, createdBy, expiresAt]
  );

  const apiKey = toPublicApiKey(rows[0]);

  if (actorUserId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertAuditLog(client, {
        actorUserId,
        action: "API_KEY_CREATED",
        partnerId: Number(partnerId),
        apiKeyId: apiKey.id,
        metadata: { name: apiKey.name, scopes: apiKey.scopes, keyPrefix: apiKey.keyPrefix },
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    apiKey,
    plaintext: material.plaintext,
  };
}

export async function revokeApiKey(apiKeyId, revokedBy = null, actorUserId = null) {
  const id = Number(apiKeyId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiKeyServiceError("ID de chave inválido.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
        UPDATE api_keys
        SET is_active = FALSE,
            revoked_at = NOW(),
            revoked_by = $2
        WHERE id = $1
          AND revoked_at IS NULL
        RETURNING
          id, partner_id, key_prefix, name, scopes, is_active,
          last_used_at, expires_at, revoked_at, created_at
      `,
      [id, revokedBy]
    );

    if (!rows[0]) {
      throw new ApiKeyServiceError(
        "Chave não encontrada ou já revogada.",
        404,
        "API_KEY_NOT_FOUND"
      );
    }

    const apiKey = toPublicApiKey(rows[0]);

    if (actorUserId) {
      await insertAuditLog(client, {
        actorUserId,
        action: "API_KEY_REVOKED",
        partnerId: apiKey.partnerId,
        apiKeyId: apiKey.id,
        metadata: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
      });
    }

    await client.query("COMMIT");
    return apiKey;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listApiKeysByPartner(partnerId) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        partner_id,
        key_prefix,
        name,
        scopes,
        is_active,
        last_used_at,
        expires_at,
        revoked_at,
        created_at
      FROM api_keys
      WHERE partner_id = $1
      ORDER BY created_at DESC
    `,
    [partnerId]
  );

  return rows.map(toPublicApiKey);
}

export function handleApiKeyServiceError(error, res) {
  if (error instanceof ApiKeyServiceError) {
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
    });
  }
  if (error instanceof PartnerServiceError) {
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
    });
  }
  if (error?.message?.startsWith("Scopes inválidos")) {
    return res.status(400).json({ message: error.message, code: "INVALID_SCOPES" });
  }
  throw error;
}
