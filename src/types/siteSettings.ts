export interface PublicSiteConfig {
  defaultNumber: string | null;
  byUf: Record<string, string>;
}

export interface LeadsWhatsappSetting {
  defaultNumber: string | null;
  byUf: Record<string, string>;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface LeadsWhatsappSettingResponse extends LeadsWhatsappSetting {}

export interface UpdateLeadsWhatsappPayload {
  defaultNumber: string;
  byUf: Record<string, string>;
}

export interface UpdateLeadsWhatsappResponse extends LeadsWhatsappSetting {}

export interface PublicCepLocationResponse {
  uf: string | null;
  city: string | null;
  cityKey: string | null;
  ibgeCode: number | null;
  source: "coverage" | "viacep" | null;
}
