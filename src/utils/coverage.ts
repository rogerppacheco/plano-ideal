import type {
  CoverageOperator,
  CoverageRecord,
  CoverageRecordInput,
  CoverageRowFields,
  FacadeGroup,
  FacadeVariant,
  GenericCoverageRow,
  NioCoverageRow,
  OperatorCoverageConfig,
  ParsedFacadeLabel,
  VeroCoverageRow,
  VivoCoverageRow,
} from "../types/coverage";
import { OPERATOR_COVERAGE_CONFIG } from "../types/coverage";

export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Ordena fachadas/números: 3, 26, 100, 111, 1004… (não 100, 1004, 1095, 111). */
export function compareAddressNumbers(a: unknown, b: unknown): number {
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  return sa.localeCompare(sb, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function sortAddressNumbers(values: string[]): string[] {
  return [...values].sort(compareAddressNumbers);
}

export function pickFieldFromRow(
  source: CoverageRowFields | Record<string, unknown> | null | undefined,
  keys: string[]
): string {
  for (const key of keys) {
    const value = source?.[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function normalizeOperatorName(name: string | null | undefined): string {
  return String(name || "")
    .trim()
    .toLowerCase();
}

export function toCoverageOperator(name: string | null | undefined): CoverageOperator | null {
  const normalized = normalizeOperatorName(name);
  if (normalized === "vivo") return "Vivo";
  if (normalized === "nio") return "Nio";
  if (normalized === "vero") return "Vero";
  return null;
}

export function toOperatorDisplayName(name: string | null | undefined): string {
  return toCoverageOperator(name) ?? String(name || "");
}

export function getOperatorCoverageConfig(operatorName: string): OperatorCoverageConfig {
  const displayName = toOperatorDisplayName(operatorName);
  if (displayName in OPERATOR_COVERAGE_CONFIG) {
    return OPERATOR_COVERAGE_CONFIG[displayName as CoverageOperator];
  }
  return {
    title: "Registros",
    hint: "Dados importados desta operadora",
    mode: "numbers",
    keys: ["NUM", "Numero", "NUMERO", "numero", "NUM_FACHADA", "Num_Fachada", "num_fachada"],
  };
}

export function recordsMatchOperator(
  record: CoverageRecordInput | CoverageRecord | null | undefined,
  operatorName: string
): boolean {
  return normalizeOperatorName(record?.operator) === normalizeOperatorName(operatorName);
}

function asRowData(
  rowData: CoverageRecordInput["row_data"]
): CoverageRowFields & Record<string, unknown> {
  if (!rowData || typeof rowData !== "object") return {};
  return rowData as CoverageRowFields & Record<string, unknown>;
}

/** Normaliza registro bruto da API para union discriminada por operadora */
export function narrowCoverageRecord(record: CoverageRecordInput): CoverageRecord {
  const operator = toCoverageOperator(record.operator);
  const row_data = asRowData(record.row_data);
  const meta = {
    source_file: record.source_file,
    sheet_name: record.sheet_name,
    imported_at: record.imported_at,
  };

  if (operator === "Vivo") {
    return { operator: "Vivo", row_data: row_data as VivoCoverageRow, ...meta };
  }
  if (operator === "Nio") {
    return { operator: "Nio", row_data: row_data as NioCoverageRow, ...meta };
  }
  if (operator === "Vero") {
    return { operator: "Vero", row_data: row_data as VeroCoverageRow, ...meta };
  }

  return {
    operator: record.operator,
    row_data: row_data as GenericCoverageRow,
    ...meta,
  };
}

export function normalizeCoverageRecords(records: CoverageRecordInput[]): CoverageRecord[] {
  if (!Array.isArray(records)) return [];
  return records.map(narrowCoverageRecord);
}

export function extractOperatorsFromRecords(records: CoverageRecordInput[]): string[] {
  if (!Array.isArray(records)) return [];
  const operators = new Set<string>();
  for (const record of records) {
    const name = String(record?.operator || "").trim();
    if (name) operators.add(name);
  }
  return Array.from(operators).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Rótulo de endereço para bases sem NUM (ex.: Vero). */
export function buildStreetLabel(
  rowData: VeroCoverageRow | CoverageRowFields | Record<string, unknown>
): string {
  const logradouro = pickFieldFromRow(rowData, [
    "LOGRADOURO",
    "logradouro",
    "Logradouro",
    "ENDERECO",
    "ENDEREÇO",
    "endereco",
  ]);
  if (!logradouro) return "";

  const bairro = pickFieldFromRow(rowData, ["BAIRRO", "bairro", "Bairro"]);
  if (bairro) return `${logradouro} · ${bairro}`;
  return logradouro;
}

export function countRecordsByOperator(records: CoverageRecordInput[]): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(records)) return counts;
  for (const record of records) {
    const name = String(record?.operator || "").trim();
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

const COMPLEMENT_KEYS = [
  "COMPLEMENTO",
  "Complemento",
  "complemento",
  "COMPL",
  "Compl",
  "COMPLEMENT",
  "complement",
];

/**
 * Rótulo para exibição: NUM ou NUM_FACHADA + COMPLEMENTO (coluna separada, padrão Nio).
 */
export function buildFacadeLabel(
  rowData: VivoCoverageRow | NioCoverageRow | CoverageRowFields | Record<string, unknown>,
  numKeys: string[]
): string {
  const num = pickFieldFromRow(rowData, numKeys);
  if (!num) return "";

  const complement = pickFieldFromRow(rowData, COMPLEMENT_KEYS);
  if (!complement) return num;

  const parsed = parseFacadeLabel(num);
  if (parsed?.hasComplement) {
    const compLower = complement.toLowerCase();
    if (num.toLowerCase().includes(compLower)) return num;
  }

  return `${num} ${complement}`.trim();
}

/**
 * Separa número base e complemento (ex.: "120 COMPL A" → base 120, suffix "COMPL A").
 */
export function parseFacadeLabel(value: unknown): ParsedFacadeLabel | null {
  const full = String(value ?? "").trim();
  if (!full) return null;
  const match = full.match(/^(\d+)\s*(.*)$/);
  if (!match) {
    return {
      base: full,
      suffix: "",
      full,
      hasComplement: false,
      isNumericBase: false,
    };
  }
  const suffix = (match[2] || "").trim();
  return {
    base: match[1],
    suffix,
    full,
    hasComplement: Boolean(suffix),
    isNumericBase: true,
  };
}

/**
 * Agrupa fachadas pelo número base para chips expansíveis.
 */
export function groupFacadeNumbers(values: string[]): FacadeGroup[] {
  const byBase = new Map<
    string,
    { base: string; variants: FacadeVariant[]; isNumericBase: boolean }
  >();

  for (const raw of sortAddressNumbers(values)) {
    const parsed = parseFacadeLabel(raw);
    if (!parsed) continue;

    const key = parsed.isNumericBase ? parsed.base : parsed.full;
    if (!byBase.has(key)) {
      byBase.set(key, { base: key, variants: [], isNumericBase: parsed.isNumericBase });
    }

    const group = byBase.get(key);
    if (!group) continue;
    if (group.variants.some((v) => v.full === parsed.full)) continue;

    group.variants.push({
      full: parsed.full,
      suffix: parsed.suffix,
      isPlain: !parsed.hasComplement,
    });
  }

  const groups = Array.from(byBase.values()) as FacadeGroup[];
  groups.sort((a, b) => compareAddressNumbers(a.base, b.base));

  for (const group of groups) {
    group.variants.sort((a, b) => compareAddressNumbers(a.full, b.full));
    const withSuffix = group.variants.filter((v) => v.suffix);
    group.isExpandable = withSuffix.length > 0 || group.variants.length > 1;
    group.complementCount = withSuffix.length || Math.max(0, group.variants.length - 1);
  }

  return groups;
}

export function isVivoCoverageRecord(
  record: CoverageRecord
): record is Extract<CoverageRecord, { operator: "Vivo" }> {
  return record.operator === "Vivo";
}

export function isNioCoverageRecord(
  record: CoverageRecord
): record is Extract<CoverageRecord, { operator: "Nio" }> {
  return record.operator === "Nio";
}

export function isVeroCoverageRecord(
  record: CoverageRecord
): record is Extract<CoverageRecord, { operator: "Vero" }> {
  return record.operator === "Vero";
}
