import { pool } from "../db.js";
import { EXTERNAL_API_SCOPES } from "../config/externalApiLimits.js";
import {
  generateApiKeyMaterial,
  hashApiKey,
  parseApiKeyPlaintext,
  verifyApiKeyHash,
} from "../utils/apiKeyCrypto.js";

const ALLOWED_SCOPES = new Set(EXTERNAL_API_SCOPES);

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
}) {
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
      RETURNING id, partner_id, key_prefix, name, scopes, created_at, expires_at
    `,
    [
      partnerId,
      material.keyPrefix,
      keyHash,
      name,
      normalizedScopes,
      createdBy,
      expiresAt,
    ]
  );

  return {
    apiKey: rows[0],
    plaintext: material.plaintext,
  };
}

export async function revokeApiKey(apiKeyId, revokedBy = null) {
  const { rows } = await pool.query(
    `
      UPDATE api_keys
      SET is_active = FALSE,
          revoked_at = NOW(),
          revoked_by = $2
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING id, partner_id, key_prefix, name, revoked_at
    `,
    [apiKeyId, revokedBy]
  );

  return rows[0] ?? null;
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

  return rows;
}
