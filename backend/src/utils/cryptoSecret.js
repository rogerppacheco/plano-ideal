import crypto from "crypto";

const ALGO = "aes-256-gcm";

function deriveKey(secret) {
  if (!secret) {
    throw new Error("PAP_CREDENTIALS_SECRET não configurada.");
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(plaintext, secret = process.env.PAP_CREDENTIALS_SECRET) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload, secret = process.env.PAP_CREDENTIALS_SECRET) {
  const key = deriveKey(secret);
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function hasCredentialsSecret() {
  return Boolean(process.env.PAP_CREDENTIALS_SECRET);
}
