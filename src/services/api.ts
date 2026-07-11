import { forceLogout } from "../lib/sessionExit";
import type { Role } from "../types/auth";
import type {
  ApiErrorCode,
  ApiErrorOptions,
  ApiErrorPayload,
  DeleteUserResponse,
  LoginResponse,
  UserMutationResponse,
  UsersListResponse,
} from "../types/api";
import type { CoverageByCepResponse, PublicViabilityResponse } from "../types/coverage";
import type {
  ActiveImportJobResponse,
  CompleteImportJobResponse,
  CreateImportJobResponse,
  ImportJobStatusResponse,
  ImportJobsHistoryResponse,
  ImportSummaryResponse,
  RevertImportJobResponse,
} from "../types/import";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const SKIP_AUTH_REDIRECT_PATHS = new Set(["/auth/login"]);

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

function buildRequestUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function logRequestFailure(
  url: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error("[API] Falha na requisição:", {
    url,
    apiBase: API_BASE_URL,
    viteApiBase: import.meta.env.VITE_API_BASE_URL ?? "(não definida no build)",
    message,
    ...context,
  });
}

function getFriendlyNetworkMessage(_url: string): string {
  if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
    return "Configuração da API ausente no build. Verifique VITE_API_BASE_URL no Railway.";
  }
  return "Erro de conexão com o servidor. Verifique a rede ou tente novamente em instantes.";
}

export class ApiError extends Error {
  status?: number;
  code?: ApiErrorCode;
  url?: string;

  constructor(message: string, { status, code, url }: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.url = url;
  }
}

interface RequestOptions extends RequestInit {
  skipAuthRedirect?: boolean;
  timeoutMs?: number;
}

function handleUnauthorized(path: string, data: ApiErrorPayload): void {
  if (SKIP_AUTH_REDIRECT_PATHS.has(path)) return;
  forceLogout({
    code: data.code || "UNAUTHORIZED",
    message: data.message,
  });
}

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuthRedirect = false, timeoutMs = 0, ...fetchOptions } = options;
  const url = buildRequestUrl(path);
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller != null ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response: Response;

  try {
    response = await fetch(url, {
      ...fetchOptions,
      signal: controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logRequestFailure(url, error, { path, type: "timeout", timeoutMs });
      throw new ApiError("A operação demorou demais. Tente novamente em instantes.", {
        status: 0,
        code: "REQUEST_TIMEOUT",
        url,
      });
    }
    logRequestFailure(url, error, { path, type: "network" });
    throw new ApiError(getFriendlyNetworkMessage(url), {
      status: 0,
      code: "NETWORK_ERROR",
      url,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  const data = (await response.json().catch(() => ({}))) as ApiErrorPayload;

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

  return data as T;
}

export function loginInternalUser({
  username,
  password,
}: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    skipAuthRedirect: true,
  });
}

export function getPublicViabilityStatus(cep: string): Promise<PublicViabilityResponse> {
  return request<PublicViabilityResponse>(`/public/viability/${encodeURIComponent(cep)}`);
}

export function getCoverageByCep(cep: string, token: string): Promise<CoverageByCepResponse> {
  return request<CoverageByCepResponse>(`/coverage/${encodeURIComponent(cep)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getImportSummary(token: string): Promise<ImportSummaryResponse> {
  return request<ImportSummaryResponse>("/import/summary", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function createImportJob({
  operator,
  files,
  token,
}: {
  operator: string;
  files: File[];
  token: string;
}): Promise<CreateImportJobResponse> {
  const formData = new FormData();
  formData.append("operator", operator);
  files.forEach((file) => formData.append("files", file));

  return request<CreateImportJobResponse>("/import", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
}

export function getImportJobStatus(
  jobId: string | number,
  token: string
): Promise<ImportJobStatusResponse> {
  return request<ImportJobStatusResponse>(`/import/jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getImportJobsHistory(token: string): Promise<ImportJobsHistoryResponse> {
  return request<ImportJobsHistoryResponse>("/import/jobs", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getActiveImportJob(token: string): Promise<ActiveImportJobResponse> {
  return request<ActiveImportJobResponse>("/import/jobs/active", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function revertImportJob(
  jobId: string | number,
  token: string
): Promise<RevertImportJobResponse> {
  return request<RevertImportJobResponse>(`/import/jobs/${jobId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function completeStuckImportJob(
  jobId: string | number,
  token: string
): Promise<CompleteImportJobResponse> {
  return request<CompleteImportJobResponse>(`/import/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getInternalUsers(token: string): Promise<UsersListResponse> {
  return request<UsersListResponse>("/users", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function createInternalUser({
  username,
  fullName,
  role,
  password,
  token,
}: {
  username: string;
  fullName: string;
  role: Role;
  password: string;
  token: string;
}): Promise<UserMutationResponse> {
  return request<UserMutationResponse>("/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username, fullName, role, password }),
  });
}

export function updateInternalUserPassword({
  userId,
  password,
  token,
}: {
  userId: number;
  password: string;
  token: string;
}): Promise<UserMutationResponse> {
  return request<UserMutationResponse>(`/users/${userId}/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
}

export function updateInternalUserStatus({
  userId,
  isActive,
  token,
}: {
  userId: number;
  isActive: boolean;
  token: string;
}): Promise<UserMutationResponse> {
  return request<UserMutationResponse>(`/users/${userId}/status`, {
    method: "PATCH",
    timeoutMs: 30000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isActive }),
  });
}

export function deleteInternalUser({
  userId,
  token,
}: {
  userId: number;
  token: string;
}): Promise<DeleteUserResponse> {
  return request<DeleteUserResponse>(`/users/${userId}`, {
    method: "DELETE",
    timeoutMs: 30000,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function startCreditConsultation({
  token,
  document,
  cpfRepresentative,
}: {
  token: string;
  document: string;
  cpfRepresentative?: string;
}): Promise<unknown> {
  return request("/credit/consult", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ document, cpfRepresentative }),
  });
}

export function getCreditConsultation(id: string | number, token: string): Promise<unknown> {
  return request(`/credit/consultations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getCreditConsultationHistory(token: string, limit = 50): Promise<unknown> {
  return request(`/credit/consultations?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getCreditConsultationScreenshot(
  id: string | number,
  token: string
): Promise<unknown> {
  return request(`/credit/consultations/${id}/screenshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getPapCredentials(token: string): Promise<unknown> {
  return request("/pap/credentials", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createPapCredential({
  token,
  label,
  matriculaPap,
  senhaPap,
}: {
  token: string;
  label: string;
  matriculaPap: string;
  senhaPap: string;
}): Promise<unknown> {
  return request("/pap/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ label, matriculaPap, senhaPap }),
  });
}

export function updatePapCredential({
  token,
  id,
  ...payload
}: {
  token: string;
  id: string | number;
  [key: string]: unknown;
}): Promise<unknown> {
  return request(`/pap/credentials/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function deletePapCredential(id: string | number, token: string): Promise<unknown> {
  return request(`/pap/credentials/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getPapTtMatriculas(token: string): Promise<unknown> {
  return request("/pap/tt-matriculas", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createPapTtMatricula({
  token,
  matricula,
}: {
  token: string;
  matricula: string;
}): Promise<unknown> {
  return request("/pap/tt-matriculas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ matricula }),
  });
}

export function updatePapTtMatricula({
  token,
  id,
  ...payload
}: {
  token: string;
  id: string | number;
  [key: string]: unknown;
}): Promise<unknown> {
  return request(`/pap/tt-matriculas/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function deletePapTtMatricula(id: string | number, token: string): Promise<unknown> {
  return request(`/pap/tt-matriculas/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
