export function externalErrorBody(code, message, extra = {}) {
  return {
    code,
    message,
    ...extra,
  };
}

export function sendExternalError(res, status, code, message, extra = {}) {
  return res.status(status).json(externalErrorBody(code, message, extra));
}
