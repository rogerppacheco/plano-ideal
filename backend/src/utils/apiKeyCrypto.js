import crypto from "crypto";
import bcrypt from "bcryptjs";

export const API_KEY_LIVE_PREFIX = "pk_live_";
const SECRET_BYTE_LENGTH = 32;
const KEY_PREFIX_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

/** Hash bcrypt pré-computado para comparação dummy em falhas (mitiga timing attacks). */
export const DUMMY_API_KEY_HASH = "$2a$12$/9K0vIPCNR/c9Yoytin6B.90cJ8RgEtNw5.kgtLzL4SWzqRDWtnsC";

/**
 * Gera material de API Key com alta entropia (crypto.randomBytes).
 * Formato: pk_live_<secret base64url>
 * keyPrefix: primeiros 8 caracteres do segredo (índice de lookup).
 */
export function generateApiKeyMaterial() {
  const secret = crypto.randomBytes(SECRET_BYTE_LENGTH).toString("base64url");
  const keyPrefix = secret.slice(0, KEY_PREFIX_LENGTH);
  const plaintext = `${API_KEY_LIVE_PREFIX}${secret}`;

  return {
    plaintext,
    keyPrefix,
    secret,
  };
}

export async function hashApiKey(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export function isApiKeyFormat(value) {
  return typeof value === "string" && value.startsWith(API_KEY_LIVE_PREFIX);
}

export function parseApiKeyPlaintext(plaintext) {
  if (!isApiKeyFormat(plaintext)) {
    return null;
  }

  const secret = plaintext.slice(API_KEY_LIVE_PREFIX.length);
  if (secret.length < KEY_PREFIX_LENGTH + 16) {
    return null;
  }

  return {
    plaintext,
    keyPrefix: secret.slice(0, KEY_PREFIX_LENGTH),
    secret,
  };
}

/**
 * Compara chave com hash usando bcrypt (tempo constante por comparação).
 * Em falha de lookup, ainda executa compare contra hash dummy.
 */
export async function verifyApiKeyHash(plaintext, keyHash) {
  const parsed = parseApiKeyPlaintext(plaintext);
  if (!parsed || !keyHash) {
    await bcrypt.compare(plaintext || "", DUMMY_API_KEY_HASH);
    return false;
  }

  return bcrypt.compare(parsed.plaintext, keyHash);
}

/**
 * Comparação timing-safe para strings/ buffers de mesmo tamanho (uso auxiliar).
 */
export function timingSafeEqualStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
