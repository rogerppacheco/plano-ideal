import { pool } from "../db.js";
import {
  LEADS_WHATSAPP_CONFIG_KEY,
  LEADS_WHATSAPP_SETTING_KEY,
  formatWhatsappForInput,
  normalizeWhatsappNumber,
  resolveLeadsWhatsappNumber,
  validateWhatsappNumber,
} from "../utils/whatsappNumber.js";
import { isValidUf, normalizeUf } from "../utils/brazilianUfs.js";

const EMPTY_CONFIG = {
  defaultNumber: null,
  byUf: {},
};

export async function getSiteSetting(key) {
  const { rows } = await pool.query(`SELECT value FROM site_settings WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setSiteSetting(key, value, updatedBy = null) {
  const query = `
    INSERT INTO site_settings (key, value, updated_at, updated_by)
    VALUES ($1, $2, NOW(), $3)
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    RETURNING key, value, updated_at, updated_by
  `;
  const { rows } = await pool.query(query, [key, value, updatedBy]);
  return rows[0];
}

function parseStoredConfig(rawValue) {
  if (!rawValue) return { ...EMPTY_CONFIG, byUf: {} };
  try {
    const parsed = JSON.parse(rawValue);
    const byUf = {};
    if (parsed?.byUf && typeof parsed.byUf === "object") {
      for (const [uf, number] of Object.entries(parsed.byUf)) {
        const normalizedUf = normalizeUf(uf);
        const digits = normalizeWhatsappNumber(number);
        if (normalizedUf && digits) {
          byUf[normalizedUf] = digits;
        }
      }
    }
    const defaultNumber = normalizeWhatsappNumber(parsed?.defaultNumber ?? "");
    return {
      defaultNumber: defaultNumber || null,
      byUf,
    };
  } catch {
    return { ...EMPTY_CONFIG, byUf: {} };
  }
}

async function loadLeadsWhatsappConfig() {
  const stored = await getSiteSetting(LEADS_WHATSAPP_CONFIG_KEY);
  if (stored) {
    return parseStoredConfig(stored);
  }

  const legacy = await getSiteSetting(LEADS_WHATSAPP_SETTING_KEY);
  if (legacy) {
    const digits = normalizeWhatsappNumber(legacy);
    return {
      defaultNumber: digits || null,
      byUf: {},
    };
  }

  return { ...EMPTY_CONFIG, byUf: {} };
}

function formatConfigForAdmin(config) {
  const byUf = {};
  for (const [uf, number] of Object.entries(config.byUf || {})) {
    byUf[uf] = formatWhatsappForInput(number);
  }
  return {
    defaultNumber: formatWhatsappForInput(config.defaultNumber),
    byUf,
  };
}

function formatConfigForPublic(config) {
  return {
    defaultNumber: config.defaultNumber,
    byUf: { ...config.byUf },
  };
}

function validateConfigPayload({ defaultNumber, byUf }) {
  const defaultValidation = validateWhatsappNumber(defaultNumber, { required: true });
  if (!defaultValidation.ok) {
    return defaultValidation;
  }

  const normalizedByUf = {};
  const entries = Object.entries(byUf || {});
  for (const [uf, rawNumber] of entries) {
    const normalizedUf = normalizeUf(uf);
    if (!normalizedUf) {
      return { ok: false, message: `UF inválida: ${uf}.` };
    }

    const raw = String(rawNumber || "").trim();
    if (!raw) continue;

    const validation = validateWhatsappNumber(raw, { required: true });
    if (!validation.ok) {
      return { ok: false, message: `Número inválido para ${normalizedUf}. ${validation.message}` };
    }
    normalizedByUf[normalizedUf] = validation.digits;
  }

  return {
    ok: true,
    config: {
      defaultNumber: defaultValidation.digits,
      byUf: normalizedByUf,
    },
  };
}

export async function getPublicSiteConfig() {
  const config = await loadLeadsWhatsappConfig();
  return formatConfigForPublic(config);
}

export async function getLeadsWhatsappSetting() {
  const config = await loadLeadsWhatsappConfig();
  const { rows } = await pool.query(
    `
      SELECT s.updated_at, s.updated_by, u.full_name AS updated_by_name
      FROM site_settings s
      LEFT JOIN internal_users u ON u.id = s.updated_by
      WHERE s.key = $1
    `,
    [LEADS_WHATSAPP_CONFIG_KEY]
  );

  const legacyRows = rows[0]
    ? rows
    : (
        await pool.query(
          `
            SELECT s.updated_at, s.updated_by, u.full_name AS updated_by_name
            FROM site_settings s
            LEFT JOIN internal_users u ON u.id = s.updated_by
            WHERE s.key = $1
          `,
          [LEADS_WHATSAPP_SETTING_KEY]
        )
      ).rows;

  const row = legacyRows[0];
  const adminConfig = formatConfigForAdmin(config);

  return {
    ...adminConfig,
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updated_by_name ?? null,
  };
}

export async function updateLeadsWhatsappConfig(payload, updatedBy) {
  const validation = validateConfigPayload(payload);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const row = await setSiteSetting(
    LEADS_WHATSAPP_CONFIG_KEY,
    JSON.stringify(validation.config),
    updatedBy
  );

  const adminConfig = formatConfigForAdmin(validation.config);
  return {
    ok: true,
    ...adminConfig,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function resolvePublicLeadsWhatsapp({ uf }) {
  const config = await loadLeadsWhatsappConfig();
  const whatsappNumber = resolveLeadsWhatsappNumber(config, uf);
  return { whatsappNumber };
}
