import { EXTERNAL_RATE_LIMITS } from "../config/externalApiLimits.js";

const buckets = new Map();

function getBucket(bucketKey, windowMs, now) {
  const current = buckets.get(bucketKey);
  if (!current || now - current.windowStart >= windowMs) {
    const fresh = { count: 0, windowStart: now };
    buckets.set(bucketKey, fresh);
    return fresh;
  }

  return current;
}

export function resetExternalRateLimitBuckets() {
  buckets.clear();
}

/**
 * Rate limit em memória por api_key_id + endpoint (MVP).
 * Resposta 429 com Retry-After em segundos.
 */
export function externalRateLimit(endpoint) {
  const config = EXTERNAL_RATE_LIMITS[endpoint];
  if (!config) {
    throw new Error(`Rate limit não configurado para endpoint: ${endpoint}`);
  }

  return (req, res, next) => {
    const apiKeyId = req.apiClient?.apiKeyId;
    if (!apiKeyId) {
      return next();
    }

    const now = Date.now();
    const bucketKey = `${apiKeyId}:${endpoint}`;
    const bucket = getBucket(bucketKey, config.windowMs, now);

    if (bucket.count >= config.maxRequests) {
      const retryAfterMs = bucket.windowStart + config.windowMs - now;
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message: "Limite de requisições excedido. Tente novamente em breve.",
        code: "RATE_LIMITED",
        retryAfterSec,
      });
    }

    bucket.count += 1;
    return next();
  };
}
