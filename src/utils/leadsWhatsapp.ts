import type { PublicSiteConfig } from "../types/siteSettings";

export function resolveLeadsWhatsappNumber(
  config: PublicSiteConfig | null,
  uf: string | null | undefined
): string | null {
  if (!config) return null;
  const normalizedUf = String(uf || "").trim().toUpperCase();
  if (normalizedUf && config.byUf?.[normalizedUf]) {
    return config.byUf[normalizedUf];
  }
  return config.defaultNumber ?? null;
}

export function hasLeadsWhatsappConfig(config: PublicSiteConfig | null): boolean {
  if (!config) return false;
  if (config.defaultNumber) return true;
  return Object.values(config.byUf || {}).some(Boolean);
}
