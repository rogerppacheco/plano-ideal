import { forceLogout } from "../lib/sessionExit";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const SKIP_AUTH_REDIRECT_PATHS = new Set(["/auth/login"]);

export function getApiBaseUrl() {
  return API_BASE_URL;
}

function buildRequestUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function logRequestFailure(url, error, context = {}) {
  // eslint-disable-next-line no-console
  console.error("[API] Falha na requisição:", {
    url,
    apiBase: API_BASE_URL,
    viteApiBase: import.meta.env.VITE_API_BASE_URL ?? "(não definida no build)",
    message: error?.message,
    ...context,
  });
}

function getFriendlyNetworkMessage(url) {
  if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
    return "Configuração da API ausente no build. Verifique VITE_API_BASE_URL no Railway.";
  }
  return "Erro de conexão com o servidor. Verifique a rede ou tente novamente em instantes.";
}

export class ApiError extends Error {
  constructor(message, { status, code, url } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.url = url;
  }
}

function handleUnauthorized(path, data) {
  if (SKIP_AUTH_REDIRECT_PATHS.has(path)) return;
  forceLogout({
    code: data.code || "UNAUTHORIZED",
    message: data.message,
  });
}

async function request(path, options = {}) {
  const { skipAuthRedirect = false, ...fetchOptions } = options;
  const url = buildRequestUrl(path);
  let response;

  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    logRequestFailure(url, error, { path, type: "network" });
    throw new ApiError(getFriendlyNetworkMessage(url), {
      status: 0,
      code: "NETWORK_ERROR",
      url,
    });
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && !skipAuthRedirect && !SKIP_AUTH_REDIRECT_PATHS.has(path)) {
    handleUnauthorized(path, data);
    throw new ApiError(data.message || "Sessão inválida.", {
      status: 401,
      code: data.code,
      url,
    });
  }

  if (!response.ok) {
    logRequestFailure(url, new Error(data.message || response.statusText), {
      path,
      status: response.status,
      code: data.code,
      type: "http",
    });
    throw new ApiError(data.message || "Falha na requisição.", {
      status: response.status,
      code: data.code,
      url,
    });
  }

  return data;
}

export function loginInternalUser({ username, password }) {
  return request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    skipAuthRedirect: true,
  });
}

export function getPublicViabilityStatus(cep) {
  return request(`/public/viability/${encodeURIComponent(cep)}`);
}

export function getCoverageByCep(cep, token) {
  return request(`/coverage/${encodeURIComponent(cep)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getImportSummary(token) {
  return request("/import/summary", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function createImportJob({ operator, files, token }) {
  const formData = new FormData();
  formData.append("operator", operator);
  files.forEach((file) => formData.append("files", file));

  return request("/import", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
}

export function getImportJobStatus(jobId, token) {
  return request(`/import/jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getImportJobsHistory(token) {
  return request("/import/jobs", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getActiveImportJob(token) {
  return request("/import/jobs/active", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function revertImportJob(jobId, token) {
  return request(`/import/jobs/${jobId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function completeStuckImportJob(jobId, token) {
  return request(`/import/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getInternalUsers(token) {
  return request("/users", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function createInternalUser({ username, fullName, role, password, token }) {
  return request("/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username, fullName, role, password }),
  });
}

export function updateInternalUserPassword({ userId, password, token }) {
  return request(`/users/${userId}/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
}

export function updateInternalUserStatus({ userId, isActive, token }) {
  return request(`/users/${userId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isActive }),
  });
}

export function deleteInternalUser({ userId, token }) {
  return request(`/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function startCreditConsultation({ token, document, cpfRepresentative }) {
  return request("/credit/consult", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ document, cpfRepresentative }),
  });
}

export function getCreditConsultation(id, token) {
  return request(`/credit/consultations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getCreditConsultationHistory(token, limit = 50) {
  return request(`/credit/consultations?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getCreditConsultationScreenshot(id, token) {
  return request(`/credit/consultations/${id}/screenshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getPapCredentials(token) {
  return request("/pap/credentials", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createPapCredential({ token, label, matriculaPap, senhaPap }) {
  return request("/pap/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ label, matriculaPap, senhaPap }),
  });
}

export function updatePapCredential({ token, id, ...payload }) {
  return request(`/pap/credentials/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function deletePapCredential(id, token) {
  return request(`/pap/credentials/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getPapTtMatriculas(token) {
  return request("/pap/tt-matriculas", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createPapTtMatricula({ token, matricula }) {
  return request("/pap/tt-matriculas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ matricula }),
  });
}

export function updatePapTtMatricula({ token, id, ...payload }) {
  return request(`/pap/tt-matriculas/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function deletePapTtMatricula(id, token) {
  return request(`/pap/tt-matriculas/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
