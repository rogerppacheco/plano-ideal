export const LEADS_WHATSAPP_SETTING_KEY = "leads_whatsapp_number";
export const LEADS_WHATSAPP_CONFIG_KEY = "leads_whatsapp_config";

export function normalizeWhatsappNumber(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (/^\d{10,11}$/.test(digits)) {
    digits = `55${digits}`;
  }
  return digits;
}

export function isValidWhatsappNumber(digits) {
  return /^55\d{10,11}$/.test(digits);
}

export function validateWhatsappNumber(raw, { required = true } = {}) {
  const digits = normalizeWhatsappNumber(raw);
  if (!digits) {
    if (!required) {
      return { ok: true, digits: "" };
    }
    return { ok: false, message: "Informe o número do WhatsApp." };
  }
  if (!isValidWhatsappNumber(digits)) {
    return {
      ok: false,
      message: "Número inválido. Use DDD + número (ex: 11999999999). O código 55 é adicionado automaticamente.",
    };
  }
  return { ok: true, digits };
}

export function formatWhatsappForInput(digits) {
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

export function resolveLeadsWhatsappNumber(config, uf) {
  if (!config) return null;
  const normalizedUf = String(uf || "").trim().toUpperCase();
  if (normalizedUf && config.byUf?.[normalizedUf]) {
    return config.byUf[normalizedUf];
  }
  return config.defaultNumber || null;
}
