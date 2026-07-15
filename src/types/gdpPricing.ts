import type { InternetPlan } from "../constants/defaultPlans";

export interface GdpCityOption {
  municipio: string;
  municipio_key: string;
  cod_ibge: number | null;
}

export interface GdpCitiesResponse {
  cities: GdpCityOption[];
}

export interface CityPricingResponse {
  uf: string;
  city: string;
  cityKey: string;
  ibgeCode: number | null;
  plans: InternetPlan[];
  sourceFile: string | null;
  updatedAt: string | null;
}

export interface GdpPricingImportSummary {
  id: number;
  fileName: string;
  importedAt: string;
  citiesCount: number;
  status: string;
  errorMessage: string | null;
  importedByName: string | null;
}

export interface GdpPricingSummaryResponse {
  citiesCount: number;
  lastImport: GdpPricingImportSummary | null;
}

export interface UploadGdpPricingResponse {
  message: string;
  import: {
    importId: number;
    citiesCount: number;
    fileName: string;
  };
  summary: GdpPricingSummaryResponse;
}
