import { API_KEY_LIVE_PREFIX } from "../utils/apiKeyCrypto.js";
import { touchApiKeyLastUsed, validateApiKey } from "../services/apiKeyService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function extractApiKey(req) {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith(API_KEY_LIVE_PREFIX)) {
      return token;
    }
  }

  return null;
}

export const requireApiKey = asyncHandler(async (req, res, next) => {
  const plaintext = extractApiKey(req);
  if (!plaintext) {
    return res.status(401).json({
      message: "API Key ausente ou inválida.",
      code: "INVALID_API_KEY",
    });
  }

  const client = await validateApiKey(plaintext);
  if (!client) {
    return res.status(401).json({
      message: "API Key ausente ou inválida.",
      code: "INVALID_API_KEY",
    });
  }

  req.apiClient = client;

  touchApiKeyLastUsed(client.apiKeyId).catch(() => {
    // não bloqueia a requisição por falha de telemetria
  });

  return next();
});

export function requireApiScope(...requiredScopes) {
  const needed = new Set(requiredScopes);

  return (req, res, next) => {
    const granted = new Set(req.apiClient?.scopes || []);
    const allowed = [...needed].every((scope) => granted.has(scope));

    if (!allowed) {
      return res.status(403).json({
        message: "API Key sem permissão para este recurso.",
        code: "SCOPE_FORBIDDEN",
      });
    }

    return next();
  };
}
