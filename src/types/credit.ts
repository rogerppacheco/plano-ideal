/** Estados canônicos do worker PAP (rota interna /api/credit/*). */
export const CREDIT_CONSULT_STATUSES = ["queued", "processing", "success", "failed"] as const;
export type CreditConsultStatus = (typeof CREDIT_CONSULT_STATUSES)[number];

/**
 * Consulta de crédito — contrato da API interna (diferente do DTO B2B externo).
 * Inclui metadados operacionais: screenshot, PAP TT, solicitante interno.
 */
export interface CreditConsultation {
  id: number;
  document: string;
  documentMasked: string;
  cpfRepresentative: string | null;
  status: CreditConsultStatus;
  approved: boolean | null;
  resultDetail: string | null;
  errorMessage: string | null;
  hasScreenshot: boolean;
  durationSeconds: number | null;
  papTtMatricula: string | null;
  requestedBy: number;
  requesterName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreditConsultationResponse {
  consultation: CreditConsultation;
}

export interface CreditConsultationsListResponse {
  consultations: CreditConsultation[];
}

export interface CreditScreenshotResponse {
  screenshotBase64: string;
}

export type CreditConsultState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "tracking"; consultation: CreditConsultation }
  | { status: "error"; message: string };

export function isTerminalCreditStatus(status: CreditConsultStatus): boolean {
  return status === "success" || status === "failed";
}

export function isPendingCreditStatus(status: CreditConsultStatus): boolean {
  return status === "queued" || status === "processing";
}

export function creditStatusLabel(status: CreditConsultStatus): string {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Consultando no PAP…";
  if (status === "success") return "Concluída";
  if (status === "failed") return "Erro";
  return status;
}
