/** Status persistido em import_jobs.status */
export const IMPORT_JOB_STATUSES = ["queued", "processing", "completed", "failed"] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

/** Fases persistidas em import_jobs.progress_phase (espelha backend/importJobProgress.js) */
export const IMPORT_PROGRESS_PHASES = [
  "queued",
  "reading",
  "parsing",
  "inserting",
  "finalizing",
] as const;
export type ImportProgressPhase = (typeof IMPORT_PROGRESS_PHASES)[number];

/** Resultado de inferProgressPhase — fase ativa ou status terminal */
export type InferredProgressPhase =
  ImportProgressPhase | Extract<ImportJobStatus, "completed" | "failed">;

export interface ImportJobFile {
  file_name: string;
  file_size_bytes?: number | null;
  rows_imported?: number | null;
  rows_ignored?: number | null;
}

/** Campos mínimos para cálculo de progresso no frontend */
export interface ImportJobProgressInput {
  id?: number;
  status?: ImportJobStatus | null;
  progress_phase?: ImportProgressPhase | string | null;
  current_step?: string | null;
  total_rows?: number | null;
  processed_rows?: number | null;
  heartbeat_at?: string | null;
}

/** Job completo retornado pelas rotas /import/* */
export interface ImportJob extends ImportJobProgressInput {
  id: number;
  operator: string;
  status: ImportJobStatus;
  detected_operator?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  total_files?: number | null;
  imported_rows?: number | null;
  ignored_rows?: number | null;
  error_message?: string | null;
  file_bytes_read?: number | null;
  reverted_at?: string | null;
  records_deleted?: number | null;
  created_by_name?: string | null;
  files?: ImportJobFile[];
  recovered?: boolean;
  operator_mismatch?: boolean;
}

export interface CreateImportJobResponse {
  jobId: number;
  status: Extract<ImportJobStatus, "queued">;
}

export interface ActiveImportJobResponse {
  job: ImportJob | null;
}

export interface ImportJobsHistoryResponse {
  jobs: ImportJob[];
}

export interface ImportSummaryResponse {
  totalImportedRows?: number;
  byOperator: Record<string, number>;
  fieldsByOperator: Record<string, string[]>;
  activeJob: ImportJob | null;
}

export interface ImportJobStatusResponse extends ImportJob {
  recovered?: boolean;
  operator_mismatch?: boolean;
}

export interface CompleteImportJobResponse {
  message: string;
  job?: ImportJob;
}

export interface RevertImportJobResponse {
  message: string;
  deletedRows?: number;
  estimatedRows?: number;
}

export interface ClearAllImportedBasesResponse {
  message: string;
  deletedRows?: number;
  deletedJobs?: number;
}
