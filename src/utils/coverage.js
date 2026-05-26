export function maskCep(value) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Ordena fachadas/números: 3, 26, 100, 111, 1004… (não 100, 1004, 1095, 111). */
export function compareAddressNumbers(a, b) {
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  return sa.localeCompare(sb, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function sortAddressNumbers(values) {
  return [...values].sort(compareAddressNumbers);
}

export function pickFieldFromRow(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

/** Rótulo de endereço para bases sem NUM (ex.: Vero). */
export function buildStreetLabel(rowData) {
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

export function countRecordsByOperator(records) {
  const counts = {};
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
export function buildFacadeLabel(rowData, numKeys) {
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
 * @returns {null | { base: string, suffix: string, full: string, hasComplement: boolean, isNumericBase: boolean }}
 */
export function parseFacadeLabel(value) {
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
 * @returns {Array<{ base: string, variants: Array<{ full: string, suffix: string, isPlain: boolean }>, isExpandable: boolean }>}
 */
export function groupFacadeNumbers(values) {
  const byBase = new Map();

  for (const raw of sortAddressNumbers(values)) {
    const parsed = parseFacadeLabel(raw);
    if (!parsed) continue;

    const key = parsed.isNumericBase ? parsed.base : parsed.full;
    if (!byBase.has(key)) {
      byBase.set(key, { base: key, variants: [], isNumericBase: parsed.isNumericBase });
    }

    const group = byBase.get(key);
    if (group.variants.some((v) => v.full === parsed.full)) continue;

    group.variants.push({
      full: parsed.full,
      suffix: parsed.suffix,
      isPlain: !parsed.hasComplement,
    });
  }

  const groups = Array.from(byBase.values());
  groups.sort((a, b) => compareAddressNumbers(a.base, b.base));

  for (const group of groups) {
    group.variants.sort((a, b) => compareAddressNumbers(a.full, b.full));
    const withSuffix = group.variants.filter((v) => v.suffix);
    group.isExpandable = withSuffix.length > 0 || group.variants.length > 1;
    group.complementCount = withSuffix.length || Math.max(0, group.variants.length - 1);
  }

  return groups;
}
