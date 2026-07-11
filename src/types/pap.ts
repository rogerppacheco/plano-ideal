export interface PapCredential {
  id: number;
  label: string;
  matriculaPap: string;
  enabled: boolean;
  inUse?: boolean;
  lockedAt?: string | null;
  createdAt?: string;
}

export interface PapTtMatricula {
  id: number;
  matricula: string;
  enabled: boolean;
  consultas_hoje?: number;
  created_at?: string;
}

export interface PapCredentialsResponse {
  credentials: PapCredential[];
}

export interface PapTtMatriculasResponse {
  matriculas: PapTtMatricula[];
}

export interface PapCredentialForm {
  label: string;
  matriculaPap: string;
  senhaPap: string;
}

export interface PapMutationResponse {
  message?: string;
}
