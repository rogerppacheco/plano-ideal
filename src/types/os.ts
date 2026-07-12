export const OS_CONSULT_STATUSES = ["queued", "processing", "success", "failed"] as const;
export type OsConsultStatus = (typeof OS_CONSULT_STATUSES)[number];

export interface OsOrderResult {
  status?: string;
  plano?: string;
  numero_os?: string;
  data_hora?: string;
  status_agendamento?: string;
  agendamento?: string;
  pendencia?: string;
  nao_pertence_pdv?: boolean;
}

export interface OsConsultation {
  id: number;
  document: string;
  documentMasked: string;
  numeroOsFiltro: string | null;
  status: OsConsultStatus;
  resultSummary: string | null;
  results: OsOrderResult[];
  resultsCount: number;
  errorMessage: string | null;
  hasScreenshot: boolean;
  durationSeconds: number | null;
  requestedBy: number;
  requesterName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface OsConsultationResponse {
  consultation: OsConsultation;
}

export interface OsConsultationsListResponse {
  consultations: OsConsultation[];
}

export interface OsScreenshotResponse {
  screenshotBase64: string;
}

export type OsConsultState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "tracking"; consultation: OsConsultation }
  | { status: "error"; message: string };

export function isTerminalOsStatus(status: OsConsultStatus): boolean {
  return status === "success" || status === "failed";
}

export function isPendingOsStatus(status: OsConsultStatus): boolean {
  return status === "queued" || status === "processing";
}

export function osStatusLabel(status: OsConsultStatus): string {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Consultando no PAP…";
  if (status === "success") return "Concluída";
  if (status === "failed") return "Erro";
  return status;
}

export function osResultBadgeLabel(consultation: OsConsultation): string {
  if (isPendingOsStatus(consultation.status)) {
    return osStatusLabel(consultation.status);
  }
  if (consultation.status === "failed") return "Erro";
  if (consultation.resultsCount === 0) return "Sem pedidos";
  if (consultation.resultsCount === 1) return "1 pedido";
  return `${consultation.resultsCount} pedidos`;
}
