import type { GdpCityOption } from "../types/gdpPricing";

export function normalizeCityName(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchCityInOptions(
  cities: GdpCityOption[],
  {
    city,
    cityKey,
    ibgeCode,
  }: {
    city?: string | null;
    cityKey?: string | null;
    ibgeCode?: number | null;
  }
): string {
  if (ibgeCode) {
    const byIbge = cities.find((item) => item.cod_ibge === ibgeCode);
    if (byIbge) return byIbge.municipio;
  }

  const normalizedKey = cityKey || (city ? normalizeCityName(city) : "");
  if (normalizedKey) {
    const byKey = cities.find((item) => item.municipio_key === normalizedKey);
    if (byKey) return byKey.municipio;
  }

  if (city) {
    const byName = cities.find(
      (item) => item.municipio.toLowerCase() === city.toLowerCase()
    );
    if (byName) return byName.municipio;
  }

  return "";
}
