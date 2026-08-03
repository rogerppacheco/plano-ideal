/**
 * Consulta ao vivo de fachadas no Power BI público (DFV multi-região).
 * Relatórios: DFV_SUDESTE, DFV_SP, DFV_SUL — entidade BASE_HP_F.
 * Independente das bases importadas legadas.
 */
import { randomUUID } from "node:crypto";

export const ENTITY = "BASE_HP_F";

export const SELECT_COLS = [
  "CEP",
  "NO_FACHADA",
  "COMPLEMENTO1",
  "COMPLEMENTO2",
  "COMPLEMENTO3",
  "LOGRADOURO",
  "BAIRRO",
  "MUNICIPIO",
  "UF",
  "VIABILIDADE_ATUAL",
  "CODIGO_CDO",
];

/** Relatórios públicos Nio por região (resource key + modelId). */
export const DEFAULT_DFV_SOURCES = Object.freeze([
  {
    id: "sudeste",
    label: "DFV Sudeste",
    resourceKey: "8a9db8f9-7cf1-4db5-90d2-5259ad149eba",
    modelId: 6061538,
  },
  {
    id: "sp",
    label: "DFV SP",
    resourceKey: "81e95c1a-e770-44e3-9646-19df8443756c",
    modelId: 7340452,
  },
  {
    id: "sul",
    label: "DFV Sul",
    resourceKey: "cc212c25-1b6a-4301-877b-703e2c7aa788",
    modelId: 6062850,
  },
]);

const CACHE_KEY_PREFIX = "dfv_pbi:cep:";
const localCache = new Map();

export class DfvPowerBiError extends Error {
  constructor(message, { code = "DFV_POWERBI_ERROR", status = 502 } = {}) {
    super(message);
    this.name = "DfvPowerBiError";
    this.code = code;
    this.status = status;
  }
}

export class DfvPowerBiTimeout extends DfvPowerBiError {
  constructor(message = "Timeout ao consultar o Power BI.") {
    super(message, { code: "DFV_POWERBI_TIMEOUT", status: 504 });
    this.name = "DfvPowerBiTimeout";
  }
}

export class DfvPowerBiDisabled extends DfvPowerBiError {
  constructor(message = "Consulta DFV Power BI desabilitada.") {
    super(message, { code: "DFV_POWERBI_DISABLED", status: 503 });
    this.name = "DfvPowerBiDisabled";
  }
}

function cfg(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

function cfgInt(name, fallback) {
  const n = Number(cfg(name, fallback));
  return Number.isFinite(n) ? n : fallback;
}

function featureEnabled() {
  const raw = String(cfg("DFV_POWERBI_ENABLED", "true")).trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

/**
 * Fontes ativas. Ordem de prioridade:
 * 1. DFV_POWERBI_SOURCES (JSON array)
 * 2. Defaults (Sudeste + SP + Sul), com overrides opcionais do Sudeste via
 *    DFV_POWERBI_RESOURCE_KEY / DFV_POWERBI_MODEL_ID
 */
export function getDfvSources() {
  const raw = cfg("DFV_POWERBI_SOURCES", "");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("array vazio");
      }
      return parsed.map((item, index) => {
        const id = String(item.id || `source_${index + 1}`).trim();
        const resourceKey = String(item.resourceKey || item.resource_key || "").trim();
        const modelId = Number(item.modelId || item.model_id || 0);
        if (!resourceKey || !modelId) {
          throw new Error(`fonte ${id} sem resourceKey/modelId`);
        }
        return {
          id,
          label: String(item.label || id).trim(),
          resourceKey,
          modelId,
        };
      });
    } catch (error) {
      throw new DfvPowerBiError(
        `DFV_POWERBI_SOURCES inválido: ${error.message || error}`,
        { code: "DFV_POWERBI_CONFIG", status: 500 }
      );
    }
  }

  const overrideKey = String(cfg("DFV_POWERBI_RESOURCE_KEY", "") || "").trim();
  const overrideModel = cfgInt("DFV_POWERBI_MODEL_ID", 0);

  return DEFAULT_DFV_SOURCES.map((source) => {
    if (source.id !== "sudeste") return { ...source };
    return {
      ...source,
      resourceKey: overrideKey || source.resourceKey,
      modelId: overrideModel > 0 ? overrideModel : source.modelId,
    };
  });
}

export function limparCep(cep) {
  let digitos = String(cep || "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.length > 8) digitos = digitos.slice(-8);
  return digitos.padStart(8, "0");
}

function semAcentos(texto) {
  return String(texto || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ehViavel(status) {
  const s = semAcentos(status || "").toUpperCase().trim();
  if (s.includes("INVIAVEL")) return false;
  return s.includes("VIAVEL");
}

export function montarComplemento(row) {
  const partes = [];
  for (const key of ["COMPLEMENTO1", "COMPLEMENTO2", "COMPLEMENTO3"]) {
    const val = row?.[key];
    if (val == null) continue;
    const texto = String(val).trim();
    if (texto && !["none", "null", "nan"].includes(texto.toLowerCase())) {
      partes.push(texto);
    }
  }
  return partes.join(" | ");
}

function headers(resourceKey) {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
    ActivityId: randomUUID(),
    RequestId: randomUUID(),
    "X-PowerBI-ResourceKey": resourceKey,
    Origin: "https://app.powerbi.com",
    Referer: "https://app.powerbi.com/",
    "Content-Type": "application/json;charset=UTF-8",
  };
}

function nullMask(item) {
  if (Object.prototype.hasOwnProperty.call(item, "\u00d8")) return Number(item["\u00d8"]) || 0;
  if (Object.prototype.hasOwnProperty.call(item, "Ø")) return Number(item.Ø) || 0;
  return 0;
}

/**
 * Parse DSR com ValueDicts, bitmask R (repeat) e Ø (null).
 * @returns {{ rows: any[][], incomplete: boolean, restartTokens: any[] | null }}
 */
export function parseDsrRows(dataObj, nCols) {
  const result = dataObj?.results?.[0]?.result;
  if (!result) {
    throw new DfvPowerBiError("Resposta Power BI sem results.");
  }

  if (!Object.prototype.hasOwnProperty.call(result, "data")) {
    const err = result.error || result.errorCode;
    if (err) throw new DfvPowerBiError(`Erro no Power BI: ${err}`);
    return { rows: [], incomplete: false, restartTokens: null };
  }

  const ds = result?.data?.dsr?.DS?.[0];
  if (!ds) throw new DfvPowerBiError("DSR inválido.");

  const valueDicts = ds.ValueDicts || {};
  const dm0 = ds.PH?.[0]?.DM0 || [];
  if (!dm0.length) return { rows: [], incomplete: false, restartTokens: null };

  let colDn = {};
  const rows = [];
  let prev = Array(nCols).fill(null);

  for (const item of dm0) {
    if (item.S) {
      colDn = {};
      for (const sdef of item.S) {
        const name = sdef?.N || "";
        const dn = sdef?.DN;
        if (name.startsWith("G") && dn) {
          colDn[Number(name.slice(1))] = dn;
        }
      }
    }

    const cVals = Array.isArray(item.C) ? [...item.C] : [];
    const rMask = Number(item.R || 0) || 0;
    const nMask = nullMask(item);
    const row = Array(nCols).fill(null);
    let ci = 0;

    for (let col = 0; col < nCols; col += 1) {
      if (nMask & (1 << col)) {
        row[col] = null;
        continue;
      }
      if (rMask & (1 << col)) {
        row[col] = prev[col];
        continue;
      }
      if (ci >= cVals.length) {
        row[col] = null;
        continue;
      }
      const raw = cVals[ci];
      ci += 1;
      const dn = colDn[col];
      if (dn && valueDicts[dn] && Number.isInteger(raw)) {
        const vd = valueDicts[dn];
        row[col] = raw >= 0 && raw < vd.length ? vd[raw] : raw;
      } else {
        row[col] = raw;
      }
    }

    prev = row;
    rows.push(row);
  }

  const incomplete = !Boolean(ds.IC ?? true);
  const restartTokens = ds.RT ?? null;
  return { rows, incomplete, restartTokens };
}

function buildCmd(filters, restartTokens = null) {
  const windowCount = cfgInt("DFV_POWERBI_WINDOW_COUNT", 5000);
  const select = SELECT_COLS.map((col) => ({
    Column: {
      Expression: { SourceRef: { Source: "b" } },
      Property: col,
    },
    Name: `${ENTITY}.${col}`,
  }));

  const windowObj = { Count: windowCount };
  if (restartTokens != null) windowObj.RestartTokens = restartTokens;

  const where = filters.map(([filterProperty, filterValue]) => {
    const literal = String(filterValue).replace(/'/g, "''");
    return {
      Condition: {
        Comparison: {
          ComparisonKind: 0,
          Left: {
            Column: {
              Expression: { SourceRef: { Source: "b" } },
              Property: filterProperty,
            },
          },
          Right: { Literal: { Value: `'${literal}'` } },
        },
      },
    };
  });

  return {
    SemanticQueryDataShapeCommand: {
      Query: {
        Version: 2,
        From: [{ Name: "b", Entity: ENTITY, Type: 0 }],
        Select: select,
        Where: where,
      },
      Binding: {
        Primary: { Groupings: [{ Projections: SELECT_COLS.map((_, i) => i) }] },
        DataReduction: {
          DataVolume: 4,
          Primary: { Window: windowObj },
        },
        Version: 1,
      },
    },
  };
}

async function queryPage(source, cmd) {
  const cluster = String(
    cfg("DFV_POWERBI_CLUSTER", "https://wabi-brazil-south-b-primary-api.analysis.windows.net") || ""
  ).replace(/\/+$/, "");
  const timeoutMs = cfgInt("DFV_POWERBI_TIMEOUT_SECONDS", 18) * 1000;
  const modelId = Number(source.modelId || 0);

  if (!cluster || !modelId || !source.resourceKey) {
    throw new DfvPowerBiError(
      `Configuração Power BI incompleta (${source.id || "fonte"}).`
    );
  }

  const payload = {
    version: "1.0.0",
    queries: [{ Query: { Commands: [cmd] } }],
    cancelQueries: [],
    modelId,
  };

  const url = `${cluster}/public/reports/querydata?synchronous=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers(source.resourceKey),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.status >= 400) {
      const text = await response.text();
      throw new DfvPowerBiError(
        `Power BI HTTP ${response.status} (${source.label || source.id}): ${text.slice(0, 300)}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError" || error.code === "ABORT_ERR") {
      throw new DfvPowerBiTimeout(`Timeout ao consultar ${source.label || source.id}.`);
    }
    if (error instanceof DfvPowerBiError) throw error;
    throw new DfvPowerBiError(
      `Falha de rede no Power BI (${source.label || source.id}): ${error.message || error}`
    );
  } finally {
    clearTimeout(timer);
  }
}

function rowsToDicts(rows) {
  return rows.map((row) => {
    const item = {};
    for (let i = 0; i < SELECT_COLS.length; i += 1) {
      item[SELECT_COLS[i]] = i < row.length ? row[i] : null;
    }
    if (item.CEP != null) item.CEP = limparCep(String(item.CEP));
    return item;
  });
}

function cacheGet(key) {
  const ttl = cfgInt("DFV_POWERBI_CACHE_TTL_SECONDS", 600);
  if (ttl <= 0) return null;
  const entry = localCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    localCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  const ttl = cfgInt("DFV_POWERBI_CACHE_TTL_SECONDS", 600);
  if (ttl <= 0) return;
  localCache.set(key, { expiresAt: Date.now() + ttl * 1000, data });
  if (localCache.size > 500) {
    const oldest = [...localCache.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, 100);
    for (const [k] of oldest) localCache.delete(k);
  }
}

async function consultarFontePorFiltro(source, filters, cacheKey, logLabel) {
  const cached = cacheGet(cacheKey);
  if (cached) {
    // eslint-disable-next-line no-console
    console.info(`[DFV-PBI] cache hit ${logLabel} (${cached.length} registros)`);
    return cached;
  }

  const started = Date.now();
  const allRows = [];
  let restart = null;
  let page = 0;
  const maxPages = cfgInt("DFV_POWERBI_MAX_PAGES", 20);

  while (page < maxPages) {
    page += 1;
    const data = await queryPage(source, buildCmd(filters, restart));
    const { rows, incomplete, restartTokens } = parseDsrRows(data, SELECT_COLS.length);
    allRows.push(...rowsToDicts(rows));
    // eslint-disable-next-line no-console
    console.info(
      `[DFV-PBI] ${logLabel} page=${page} +${rows.length} total=${allRows.length} incomplete=${incomplete}`
    );
    if (!incomplete || !restartTokens || !rows.length) break;
    restart = restartTokens;
  }

  // eslint-disable-next-line no-console
  console.info(
    `[DFV-PBI] ${logLabel} concluído: ${allRows.length} registros em ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
  cacheSet(cacheKey, allRows);
  return allRows;
}

/**
 * Consulta CEP em todas as regiões DFV em paralelo e mescla os resultados.
 * @returns {{ registros: object[], regions: object[] }}
 */
export async function consultarFachadasPorCep(cep) {
  if (!featureEnabled()) throw new DfvPowerBiDisabled();

  const cepLimpo = limparCep(cep);
  if (cepLimpo.length !== 8) {
    throw new DfvPowerBiError("CEP inválido.", { code: "INVALID_CEP", status: 400 });
  }

  const sources = getDfvSources();
  if (!sources.length) {
    throw new DfvPowerBiError("Nenhuma fonte Power BI DFV configurada.");
  }

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const rows = await consultarFontePorFiltro(
        source,
        [["CEP", cepLimpo]],
        `${CACHE_KEY_PREFIX}${source.id}:${cepLimpo}`,
        `${source.id}|CEP=${cepLimpo}`
      );
      return {
        source,
        rows: rows.map((row) => ({
          ...row,
          _regionId: source.id,
          _regionLabel: source.label,
        })),
      };
    })
  );

  const regions = [];
  const registros = [];
  const errors = [];

  for (let i = 0; i < settled.length; i += 1) {
    const source = sources[i];
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      const count = outcome.value.rows.length;
      regions.push({
        id: source.id,
        label: source.label,
        count,
        ok: true,
      });
      registros.push(...outcome.value.rows);
    } else {
      const reason = outcome.reason;
      const message = reason?.message || String(reason);
      regions.push({
        id: source.id,
        label: source.label,
        count: 0,
        ok: false,
        error: message,
      });
      errors.push(reason);
      // eslint-disable-next-line no-console
      console.warn(`[DFV-PBI] falha ${source.id}:`, message);
    }
  }

  if (!registros.length && errors.length === sources.length) {
    const first = errors[0];
    if (first instanceof DfvPowerBiError) throw first;
    throw new DfvPowerBiError(
      `Falha ao consultar todas as regiões DFV: ${first?.message || first}`
    );
  }

  return { registros, regions };
}

function ordenarChaveFachada(num) {
  const texto = String(num || "").trim();
  const digitos = texto.replace(/\D/g, "");
  const n = digitos ? Number(digitos) : 1e9;
  return [Number.isFinite(n) ? n : 1e9, texto];
}

/**
 * Prefere viáveis; se não houver, mantém todos. Deduplica por (número + complementos + UF).
 */
export function filtrarEDeduplicar(registros) {
  const viaveis = registros.filter((r) => ehViavel(r.VIABILIDADE_ATUAL));
  const onlyViable = viaveis.length > 0;
  const base = onlyViable ? viaveis : [...registros];

  const vistos = new Set();
  const unicos = [];
  for (const row of base) {
    const num = String(row.NO_FACHADA || "").trim();
    const compl = montarComplemento(row);
    const uf = String(row.UF || "").trim().toUpperCase();
    const logr = String(row.LOGRADOURO || "").trim().toUpperCase();
    const chave = `${uf}|${logr}|${num}|${compl}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push({
      ...row,
      _complemento: compl,
      _linha: compl ? `${num} (${compl})` : num,
    });
  }

  unicos.sort((a, b) => {
    const [na, sa] = ordenarChaveFachada(a.NO_FACHADA);
    const [nb, sb] = ordenarChaveFachada(b.NO_FACHADA);
    if (na !== nb) return na - nb;
    return sa.localeCompare(sb, "pt-BR");
  });

  return { registros: unicos, onlyViable };
}

/** Converte registros Power BI no shape CoverageRecord do Plano Ideal. */
export function toCoverageRecords(registros) {
  const { registros: filtrados, onlyViable } = filtrarEDeduplicar(registros);
  const records = filtrados.map((row) => {
    const complemento = row._complemento || montarComplemento(row);
    const regionLabel = row._regionLabel || "Power BI DFV";
    return {
      operator: "Nio",
      source_file: regionLabel,
      sheet_name: ENTITY,
      imported_at: null,
      row_data: {
        CEP: row.CEP,
        NUM_FACHADA: String(row.NO_FACHADA ?? "").trim(),
        NO_FACHADA: row.NO_FACHADA,
        COMPLEMENTO: complemento || undefined,
        COMPLEMENTO1: row.COMPLEMENTO1,
        COMPLEMENTO2: row.COMPLEMENTO2,
        COMPLEMENTO3: row.COMPLEMENTO3,
        LOGRADOURO: row.LOGRADOURO,
        BAIRRO: row.BAIRRO,
        MUNICIPIO: row.MUNICIPIO,
        CIDADE: row.MUNICIPIO,
        UF: row.UF,
        VIABILIDADE_ATUAL: row.VIABILIDADE_ATUAL,
        CODIGO_CDO: row.CODIGO_CDO,
        DFV_REGIAO: row._regionLabel || undefined,
        DFV_REGIAO_ID: row._regionId || undefined,
      },
    };
  });

  const cdoCodes = [
    ...new Set(
      filtrados
        .map((r) => String(r.CODIGO_CDO || "").trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    records,
    onlyViable,
    cdoCodes,
    totalRaw: registros.length,
  };
}

export async function getNioCoverageFromPowerBi(cepDigits) {
  const { registros, regions } = await consultarFachadasPorCep(cepDigits);
  const mapped = toCoverageRecords(registros);
  const activeRegions = regions.filter((r) => r.ok && r.count > 0).map((r) => r.label);

  return {
    cep: limparCep(cepDigits),
    operators: mapped.records.length > 0 ? ["Nio"] : [],
    records: mapped.records,
    source: "powerbi_dfv",
    meta: {
      onlyViable: mapped.onlyViable,
      cdoCodes: mapped.cdoCodes,
      totalRaw: mapped.totalRaw,
      regions,
      activeRegions,
    },
  };
}

export async function hasNioCoverageInPowerBi(cepDigits) {
  const coverage = await getNioCoverageFromPowerBi(cepDigits);
  return coverage.records.length > 0;
}

/** Expõe limpeza de cache em testes. */
export function _clearDfvPowerBiCacheForTests() {
  localCache.clear();
}
