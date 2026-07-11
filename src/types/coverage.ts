/** Operadoras com formato de viabilidade conhecido no plano-ideal */
export const COVERAGE_OPERATORS = ["Vivo", "Nio", "Vero"] as const;
export type CoverageOperator = (typeof COVERAGE_OPERATORS)[number];

export type CoverageDisplayMode = "numbers" | "streets";

/** Campos comuns em row_data (chaves variam entre CSV/XLSX e operadoras) */
export interface CoverageRowFields {
  CEP?: string;
  cep?: string;
  UF?: string;
  uf?: string;
  CIDADE?: string;
  Cidade?: string;
  cidade?: string;
  MUNICIPIO?: string;
  municipio?: string;
  MUNICÍPIO?: string;
  BAIRRO?: string;
  bairro?: string;
  Bairro?: string;
  LOGRADOURO?: string;
  logradouro?: string;
  Logradouro?: string;
  ENDERECO?: string;
  ENDEREÇO?: string;
  endereco?: string;
  [key: string]: string | number | boolean | null | undefined;
}

/** Vivo / bases FTTH: número de fachada em NUM */
export interface VivoCoverageRow extends CoverageRowFields {
  NUM?: string;
  Numero?: string;
  NUMERO?: string;
  numero?: string;
}

/** Nio: fachada + complemento em colunas separadas */
export interface NioCoverageRow extends CoverageRowFields {
  NUM_FACHADA?: string;
  Num_Fachada?: string;
  num_fachada?: string;
  COMPLEMENTO?: string;
  Complemento?: string;
  complemento?: string;
  COMPL?: string;
  Compl?: string;
  COMPLEMENT?: string;
  complement?: string;
}

/** Vero: cobertura por logradouro (sem número de fachada) */
export interface VeroCoverageRow extends CoverageRowFields {
  // Endereço via LOGRADOURO + BAIRRO herdados de CoverageRowFields
}

/** Registro genérico para operadoras ainda não mapeadas */
export interface GenericCoverageRow extends CoverageRowFields {
  NUM?: string;
  NUM_FACHADA?: string;
  COMPLEMENTO?: string;
}

export interface CoverageRecordMeta {
  source_file?: string | null;
  sheet_name?: string | null;
  imported_at?: string | null;
}

/** Entrada bruta da API antes de normalização */
export interface CoverageRecordInput extends CoverageRecordMeta {
  operator: string;
  row_data?: CoverageRowFields | Record<string, unknown> | null;
}

/** Union discriminada por operadora — base para UI sem any */
export type CoverageRecord =
  | ({ operator: "Vivo"; row_data: VivoCoverageRow } & CoverageRecordMeta)
  | ({ operator: "Nio"; row_data: NioCoverageRow } & CoverageRecordMeta)
  | ({ operator: "Vero"; row_data: VeroCoverageRow } & CoverageRecordMeta)
  | ({ operator: string; row_data: GenericCoverageRow } & CoverageRecordMeta);

export interface CoverageByCepResponse {
  cep: string;
  operators: string[];
  records: CoverageRecordInput[];
}

export interface PublicViabilityResponse {
  statusCode: "V-OK" | "V-NOK" | string;
}

export interface OperatorCoverageConfig {
  title: string;
  hint: string;
  mode: CoverageDisplayMode;
  keys: string[];
}

export const OPERATOR_COVERAGE_CONFIG: Record<CoverageOperator, OperatorCoverageConfig> = {
  Vivo: {
    title: "Números de fachada",
    hint: "Coluna NUM",
    mode: "numbers",
    keys: ["NUM", "Numero", "NUMERO", "numero"],
  },
  Nio: {
    title: "Números de fachada",
    hint: "Coluna NUM_FACHADA + complemento",
    mode: "numbers",
    keys: ["NUM_FACHADA", "Num_Fachada", "num_fachada"],
  },
  Vero: {
    title: "Logradouros cobertos",
    hint: "Endereço por logradouro (sem número de fachada)",
    mode: "streets",
    keys: [],
  },
};

export interface ParsedFacadeLabel {
  base: string;
  suffix: string;
  full: string;
  hasComplement: boolean;
  isNumericBase: boolean;
}

export interface FacadeVariant {
  full: string;
  suffix: string;
  isPlain: boolean;
}

export interface FacadeGroup {
  base: string;
  variants: FacadeVariant[];
  isNumericBase: boolean;
  isExpandable: boolean;
  complementCount: number;
}
