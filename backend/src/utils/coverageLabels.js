const OPERATOR_COVERAGE_CONFIG = {
  Vivo: {
    mode: "facades",
    keys: ["NUM", "Numero", "NUMERO", "numero"],
  },
  Nio: {
    mode: "facades",
    keys: ["NUM_FACHADA", "Num_Fachada", "num_fachada", "NO_FACHADA"],
  },
  Vero: {
    mode: "streets",
    keys: [],
  },
};

const COMPLEMENT_KEYS = [
  "COMPLEMENTO",
  "Complemento",
  "complemento",
  "COMPL",
  "Compl",
  "COMPLEMENT",
  "complement",
];

export function pickFieldFromRow(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function compareAddressNumbers(a, b) {
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  return sa.localeCompare(sb, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function sortAddressNumbers(values) {
  return [...values].sort(compareAddressNumbers);
}

function normalizeOperatorName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

export function toOperatorDisplayName(name) {
  const normalized = normalizeOperatorName(name);
  if (normalized === "vivo") return "Vivo";
  if (normalized === "nio") return "Nio";
  if (normalized === "vero") return "Vero";
  return String(name || "").trim();
}

export function getOperatorCoverageConfig(operatorName) {
  const displayName = toOperatorDisplayName(operatorName);
  if (displayName in OPERATOR_COVERAGE_CONFIG) {
    return { name: displayName, ...OPERATOR_COVERAGE_CONFIG[displayName] };
  }

  return {
    name: displayName,
    mode: "facades",
    keys: ["NUM", "Numero", "NUMERO", "numero", "NUM_FACHADA", "Num_Fachada", "num_fachada"],
  };
}

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
  if (bairro) return `${logradouro} - ${bairro}`;
  return logradouro;
}

function parseFacadeLabel(value) {
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

function groupFacadeNumbers(values) {
  const byBase = new Map();

  for (const raw of sortAddressNumbers(values)) {
    const parsed = parseFacadeLabel(raw);
    if (!parsed) continue;

    const key = parsed.isNumericBase ? parsed.base : parsed.full;
    if (!byBase.has(key)) {
      byBase.set(key, { base: key, variants: [], isNumericBase: parsed.isNumericBase });
    }

    const group = byBase.get(key);
    if (group.variants.some((variant) => variant.full === parsed.full)) continue;

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
    const withSuffix = group.variants.filter((variant) => variant.suffix);
    group.isExpandable = withSuffix.length > 0 || group.variants.length > 1;
    group.complementCount = withSuffix.length || Math.max(0, group.variants.length - 1);
  }

  return groups;
}

export function formatFacadeGroupItem(group) {
  if (!group.isExpandable || group.complementCount <= 0) {
    return group.variants[0]?.full || group.base;
  }

  return `${group.base} +${group.complementCount}`;
}

export function buildOperatorFacadeItems(records, keys) {
  const labels = [];
  for (const record of records) {
    const label = buildFacadeLabel(record.row_data || {}, keys);
    if (label) labels.push(label);
  }

  return groupFacadeNumbers(labels).map(formatFacadeGroupItem);
}

export function buildOperatorStreetItems(records) {
  const seen = new Set();
  const items = [];

  for (const record of records) {
    const label = buildStreetLabel(record.row_data || {});
    if (!label || seen.has(label)) continue;
    seen.add(label);
    items.push(label);
  }

  return items.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}
