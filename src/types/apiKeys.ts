export const API_SCOPES = ["coverage", "credit"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface Partner {
  id: number;
  name: string;
  slug: string;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  activeKeyCount?: number;
}

export interface ApiKeyView {
  id: number;
  partnerId: number;
  keyPrefix: string;
  displayPrefix: string;
  name: string;
  scopes: ApiScope[];
  isActive: boolean;
  isRevoked: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface PartnersListResponse {
  partners: Partner[];
}

export interface PartnerMutationResponse {
  partner: Partner;
  message?: string;
}

export interface ApiKeysListResponse {
  apiKeys: ApiKeyView[];
}

export interface CreatePartnerForm {
  name: string;
  slug?: string;
  contactEmail?: string;
}

export interface UpdatePartnerForm {
  name?: string;
  contactEmail?: string | null;
  isActive?: boolean;
}

export interface CreateApiKeyForm {
  name: string;
  scopes: ApiScope[];
}

/** Resposta write-only: `plaintext` só existe na criação. */
export interface CreateApiKeyResponse {
  apiKey: ApiKeyView;
  plaintext: string;
  message?: string;
}

export interface RevokeApiKeyResponse {
  apiKey: ApiKeyView;
  message?: string;
}

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}
