import fs from "node:fs/promises";
import XLSX from "xlsx";
import { pool } from "../db.js";
import { normalizeUf } from "../utils/brazilianUfs.js";
import { normalizeCityName } from "../utils/cityName.js";
import { buildPlansFromGdpOffers } from "../utils/gdpOfferParser.js";

const GDP_SHEET_NAME = "PAP (Local)";
const CARTAO_COLUMN = "OFERTA PRINCIPAL CARTAO";
const DACC_COLUMN = "OFERTA PRINCIPAL DACC";

function pickSheet(workbook) {
  if (workbook.SheetNames.includes(GDP_SHEET_NAME)) {
    return workbook.Sheets[GDP_SHEET_NAME];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

function parseWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = pickSheet(workbook);
  if (!sheet) {
    throw new Error("Planilha GDP vazia ou inválida.");
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export async function importGdpPricingFile({ filePath, fileName, importedBy }) {
  const rows = parseWorkbookRows(filePath);
  if (!rows.length) {
    throw new Error("A planilha não contém linhas para importar.");
  }

  const requiredColumns = ["UF", "MUNICIPIO", CARTAO_COLUMN, DACC_COLUMN];
  const sample = rows[0];
  const missing = requiredColumns.filter((column) => !(column in sample));
  if (missing.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);
  }

  const client = await pool.connect();
  let importId = null;

  try {
    await client.query("BEGIN");

    const importResult = await client.query(
      `
        INSERT INTO gdp_pricing_imports (file_name, imported_by, status, cities_count)
        VALUES ($1, $2, 'processing', 0)
        RETURNING id
      `,
      [fileName, importedBy]
    );
    importId = importResult.rows[0].id;

    await client.query(`DELETE FROM gdp_city_pricing`);

    let importedCount = 0;
    const seen = new Set();

    for (const row of rows) {
      const uf = normalizeUf(row.UF);
      const municipio = String(row.MUNICIPIO || "").trim();
      const municipioKey = normalizeCityName(municipio);
      if (!uf || !municipioKey) continue;

      const dedupKey = `${uf}:${municipioKey}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const plans = buildPlansFromGdpOffers(row[CARTAO_COLUMN], row[DACC_COLUMN]);
      if (!plans.length) continue;

      const codIbge = Number(row.COD_IBGE);
      await client.query(
        `
          INSERT INTO gdp_city_pricing (
            uf, municipio, municipio_key, cod_ibge, cartao_offer_raw, dacc_offer_raw,
            plans, import_id, source_file
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        `,
        [
          uf,
          municipio,
          municipioKey,
          Number.isInteger(codIbge) ? codIbge : null,
          String(row[CARTAO_COLUMN] || ""),
          String(row[DACC_COLUMN] || ""),
          JSON.stringify(plans),
          importId,
          fileName,
        ]
      );
      importedCount += 1;
    }

    if (!importedCount) {
      throw new Error("Nenhuma cidade válida com preços foi encontrada na planilha.");
    }

    await client.query(
      `
        UPDATE gdp_pricing_imports
        SET status = 'completed', cities_count = $2
        WHERE id = $1
      `,
      [importId, importedCount]
    );

    await client.query("COMMIT");
    return { importId, citiesCount: importedCount, fileName };
  } catch (error) {
    await client.query("ROLLBACK");
    if (importId) {
      await client.query(
        `
          UPDATE gdp_pricing_imports
          SET status = 'failed', error_message = $2
          WHERE id = $1
        `,
        [importId, error?.message || "Falha na importação GDP."]
      );
    }
    throw error;
  } finally {
    client.release();
    await fs.unlink(filePath).catch(() => {});
  }
}

export async function getGdpPricingSummary() {
  const [{ rows: countRows }, { rows: importRows }] = await Promise.all([
    pool.query(`SELECT COUNT(*)::INT AS total FROM gdp_city_pricing`),
    pool.query(
      `
        SELECT id, file_name, imported_at, cities_count, status, error_message,
               u.full_name AS imported_by_name
        FROM gdp_pricing_imports i
        LEFT JOIN internal_users u ON u.id = i.imported_by
        ORDER BY imported_at DESC
        LIMIT 1
      `
    ),
  ]);

  const lastImport = importRows[0];
  return {
    citiesCount: countRows[0]?.total ?? 0,
    lastImport: lastImport
      ? {
          id: lastImport.id,
          fileName: lastImport.file_name,
          importedAt: lastImport.imported_at,
          citiesCount: lastImport.cities_count,
          status: lastImport.status,
          errorMessage: lastImport.error_message,
          importedByName: lastImport.imported_by_name,
        }
      : null,
  };
}

export async function listGdpCitiesByUf(uf) {
  const normalizedUf = normalizeUf(uf);
  if (!normalizedUf) return [];

  const { rows } = await pool.query(
    `
      SELECT municipio, municipio_key, cod_ibge
      FROM gdp_city_pricing
      WHERE uf = $1
      ORDER BY municipio ASC
    `,
    [normalizedUf]
  );
  return rows;
}

export async function getCityPricing({ uf, city, ibgeCode }) {
  const normalizedUf = normalizeUf(uf);
  if (!normalizedUf) return null;

  if (ibgeCode) {
    const byIbge = await pool.query(
      `
        SELECT uf, municipio, municipio_key, cod_ibge, plans, source_file, updated_at
        FROM gdp_city_pricing
        WHERE cod_ibge = $1
        LIMIT 1
      `,
      [Number(ibgeCode)]
    );
    if (byIbge.rows[0]) return mapPricingRow(byIbge.rows[0]);
  }

  const cityKey = normalizeCityName(city);
  if (!cityKey) return null;

  const { rows } = await pool.query(
    `
      SELECT uf, municipio, municipio_key, cod_ibge, plans, source_file, updated_at
      FROM gdp_city_pricing
      WHERE uf = $1 AND municipio_key = $2
      LIMIT 1
    `,
    [normalizedUf, cityKey]
  );

  return rows[0] ? mapPricingRow(rows[0]) : null;
}

function mapPricingRow(row) {
  return {
    uf: row.uf,
    city: row.municipio,
    cityKey: row.municipio_key,
    ibgeCode: row.cod_ibge,
    plans: row.plans,
    sourceFile: row.source_file,
    updatedAt: row.updated_at,
  };
}
