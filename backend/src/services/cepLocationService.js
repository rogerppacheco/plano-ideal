import { pool } from "../db.js";
import { isValidUf, normalizeUf } from "../utils/brazilianUfs.js";
import { normalizeCityName } from "../utils/cityName.js";

const UF_FIELDS = ["UF", "uf", "Estado", "estado", "SIGLA_UF", "sigla_uf"];
const CITY_FIELDS = [
  "CIDADE",
  "Cidade",
  "MUNICIPIO",
  "Município",
  "MUNICÍPIO",
  "municipio",
  "LOCALIDADE",
  "localidade",
  "MUNICIPIO_NOVA_FIBRA",
];

function pickUfFromRowData(rowData) {
  if (!rowData || typeof rowData !== "object") return null;
  for (const field of UF_FIELDS) {
    const value = normalizeUf(rowData[field]);
    if (value) return value;
  }
  return null;
}

function pickCityFromRowData(rowData) {
  if (!rowData || typeof rowData !== "object") return null;
  for (const field of CITY_FIELDS) {
    const raw = String(rowData[field] || "").trim();
    if (raw) return raw;
  }
  return null;
}

async function resolveLocationFromCoverage(cepDigits) {
  const { rows } = await pool.query(
    `
      SELECT row_data
      FROM coverage_records
      WHERE cep_digits = $1
      LIMIT 50
    `,
    [cepDigits]
  );

  for (const row of rows) {
    const uf = pickUfFromRowData(row.row_data);
    const city = pickCityFromRowData(row.row_data);
    if (uf || city) {
      return {
        uf,
        city,
        cityKey: city ? normalizeCityName(city) : null,
        ibgeCode: null,
        source: "coverage",
      };
    }
  }

  return null;
}

async function resolveLocationFromViaCep(cepDigits) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (data?.erro) return null;

    const uf = normalizeUf(data?.uf);
    const city = String(data?.localidade || "").trim() || null;
    const ibgeCode = Number(data?.ibge);
    if (!uf && !city) return null;

    return {
      uf,
      city,
      cityKey: city ? normalizeCityName(city) : null,
      ibgeCode: Number.isInteger(ibgeCode) ? ibgeCode : null,
      source: "viacep",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveLocationFromCep(cepDigits) {
  const digits = String(cepDigits || "").replace(/\D/g, "");
  if (digits.length !== 8) {
    return { uf: null, city: null, cityKey: null, ibgeCode: null, source: null };
  }

  const fromCoverage = await resolveLocationFromCoverage(digits);
  if (fromCoverage?.uf && fromCoverage?.city) {
    return fromCoverage;
  }

  const fromViaCep = await resolveLocationFromViaCep(digits);
  if (fromViaCep) {
    return {
      uf: fromViaCep.uf ?? fromCoverage?.uf ?? null,
      city: fromViaCep.city ?? fromCoverage?.city ?? null,
      cityKey: fromViaCep.cityKey ?? fromCoverage?.cityKey ?? null,
      ibgeCode: fromViaCep.ibgeCode ?? fromCoverage?.ibgeCode ?? null,
      source: fromViaCep.source,
    };
  }

  if (fromCoverage) {
    return fromCoverage;
  }

  return { uf: null, city: null, cityKey: null, ibgeCode: null, source: null };
}

export async function resolveUfFromCep(cepDigits) {
  const location = await resolveLocationFromCep(cepDigits);
  return {
    uf: location.uf,
    source: location.source,
  };
}

export function needsManualUfSelection(result) {
  return !result?.uf || !isValidUf(result.uf);
}
