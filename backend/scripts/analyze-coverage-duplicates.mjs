/**
 * Analisa duplicatas lógicas em coverage_records (produção via .env.railway).
 * Uso: node ./scripts/analyze-coverage-duplicates.mjs
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, getDbSchema } from "../src/db.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, "backend", ".env") });
dotenv.config({ path: path.join(root, ".env.railway"), override: true });

const pool = createPool();

function describeDatabaseUrl(url = process.env.DATABASE_URL || "") {
  try {
    const u = new URL(url.replace(/^postgresql:/, "postgres:"));
    const host = u.hostname || "?";
    const isLocal = /localhost|127\.0\.0\.1/i.test(host);
    return { label: isLocal ? "LOCAL" : "REMOTO", host };
  } catch {
    return { label: "?", host: "?" };
  }
}

async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function run() {
  const schema = getDbSchema();
  const conn = describeDatabaseUrl();
  console.log(`\n=== Duplicatas coverage_records (schema: ${schema}) ===`);
  console.log(`Conexão: ${conn.label} | host ${conn.host}\n`);

  await pool.query(`SET statement_timeout = '600000'`); // 10 min

  const totals = await one(`
    SELECT
      COUNT(*) FILTER (WHERE operator = 'Nio')::bigint AS nio_total,
      COUNT(*) FILTER (WHERE operator = 'Vivo')::bigint AS vivo_total,
      COUNT(*) FILTER (WHERE operator = 'Nio' AND dedup_secondary = '')::bigint AS nio_sem_dedup,
      COUNT(*) FILTER (WHERE operator = 'Vivo' AND dedup_secondary = '')::bigint AS vivo_sem_dedup
    FROM coverage_records
  `);
  console.log("Totais por operadora:");
  console.log(
    `  Nio:  ${totals.nio_total?.toLocaleString("pt-BR")} (${totals.nio_sem_dedup} sem dedup_secondary)`
  );
  console.log(
    `  Vivo: ${totals.vivo_total?.toLocaleString("pt-BR")} (${totals.vivo_sem_dedup} sem dedup_secondary)`
  );

  const idx = await one(
    `
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = $1 AND tablename = 'coverage_records'
        AND indexname = 'idx_coverage_natural_upsert'
    ) AS has_unique_idx
  `,
    [schema]
  );
  console.log(
    `\nÍndice único (operator, cep_digits, dedup_secondary): ${idx.has_unique_idx ? "SIM" : "NÃO"}`
  );

  // 1) Violação da chave que o upsert usa (deveria ser 0 com índice)
  for (const op of ["Nio", "Vivo"]) {
    const dupKey = await one(
      `
      SELECT COUNT(*)::bigint AS grupos_dup, COALESCE(SUM(cnt - 1), 0)::bigint AS linhas_extras
      FROM (
        SELECT COUNT(*)::bigint AS cnt
        FROM coverage_records
        WHERE operator = $1 AND dedup_secondary <> ''
        GROUP BY cep_digits, dedup_secondary
        HAVING COUNT(*) > 1
      ) t
    `,
      [op]
    );
    console.log(`\n[${op}] Mesmo CEP + chave dedup (NUM/NUM_FACHADA em dedup_secondary):`);
    console.log(`  Grupos duplicados: ${dupKey.grupos_dup}`);
    console.log(`  Linhas extras (além da 1ª por grupo): ${dupKey.linhas_extras}`);
  }

  // 2) Nio: CEP + fachada + complemento (lógica de negócio)
  console.log("\n[Nio] Mesmo CEP + NUM_FACHADA + COMPLEMENTO (normalizado em row_data):");
  const nioTriple = await one(`
    SELECT COUNT(*)::bigint AS grupos_dup, COALESCE(SUM(cnt - 1), 0)::bigint AS linhas_extras
    FROM (
      SELECT COUNT(*)::bigint AS cnt
      FROM coverage_records
      WHERE operator = 'Nio'
      GROUP BY
        cep_digits,
        dedup_secondary,
        TRIM(REGEXP_REPLACE(
          LOWER(COALESCE(
            NULLIF(TRIM(row_data->>'COMPLEMENTO'), ''),
            NULLIF(TRIM(row_data->>'complemento'), ''),
            ''
          )),
          '\\s+', ' ', 'g'
        ))
      HAVING COUNT(*) > 1
    ) t
  `);
  console.log(`  Grupos duplicados: ${nioTriple.grupos_dup}`);
  console.log(`  Linhas extras: ${nioTriple.linhas_extras}`);

  // 3) Nio: mesmo CEP+fachada, complementos diferentes (colisão do upsert atual)
  const nioCollide = await one(`
    SELECT COUNT(*)::bigint AS grupos
    FROM (
      SELECT cep_digits, dedup_secondary
      FROM coverage_records
      WHERE operator = 'Nio' AND dedup_secondary <> ''
      GROUP BY cep_digits, dedup_secondary
      HAVING COUNT(DISTINCT TRIM(REGEXP_REPLACE(
        LOWER(COALESCE(
          NULLIF(TRIM(row_data->>'COMPLEMENTO'), ''),
          NULLIF(TRIM(row_data->>'complemento'), ''),
          ''
        )),
        '\\s+', ' ', 'g'
      ))) > 1
    ) t
  `);
  console.log(
    "\n[Nio] Mesmo CEP + fachada, mas COMPLEMENTO distinto (1 linha no banco — último import):"
  );
  console.log(
    `  Grupos CEP+fachada com >1 complemento distinto no arquivo histórico: ${nioCollide.grupos}`
  );
  console.log(
    "  (Com upsert atual só resta 1 linha por CEP+fachada; importações antigas foram sobrescritas.)"
  );

  // 4) Vivo: CEP + NUM (dedup) — já coberto; opcional CEP+fachada se coluna existir
  console.log("\n[Vivo] Mesmo CEP + NUM (dedup_secondary / coluna NUM):");
  const vivoNum = await one(`
    SELECT COUNT(*)::bigint AS grupos_dup, COALESCE(SUM(cnt - 1), 0)::bigint AS linhas_extras
    FROM (
      SELECT COUNT(*)::bigint AS cnt
      FROM coverage_records
      WHERE operator = 'Vivo' AND dedup_secondary <> ''
      GROUP BY cep_digits, dedup_secondary
      HAVING COUNT(*) > 1
    ) t
  `);
  console.log(`  Grupos duplicados: ${vivoNum.grupos_dup}`);
  console.log(`  Linhas extras: ${vivoNum.linhas_extras}`);

  // Amostras se houver duplicata na chave dedup
  for (const op of ["Nio", "Vivo"]) {
    const sample = await pool.query(
      `
        SELECT cep_digits, dedup_secondary, COUNT(*)::int AS n
        FROM coverage_records
        WHERE operator = $1 AND dedup_secondary <> ''
        GROUP BY cep_digits, dedup_secondary
        HAVING COUNT(*) > 1
        ORDER BY n DESC
        LIMIT 5
      `,
      [op]
    );
    if (sample.rows.length) {
      console.log(`\n  Amostra ${op} (CEP, dedup_secondary, qtd):`);
      for (const r of sample.rows) {
        console.log(`    ${r.cep_digits} | ${r.dedup_secondary} | ${r.n}`);
      }
    }
  }

  const nioTripleSample = await pool.query(`
    SELECT cep_digits, dedup_secondary,
      TRIM(REGEXP_REPLACE(
        LOWER(COALESCE(
          NULLIF(TRIM(row_data->>'COMPLEMENTO'), ''),
          NULLIF(TRIM(row_data->>'complemento'), ''),
          ''
        )),
        '\\s+', ' ', 'g'
      )) AS complemento,
      COUNT(*)::int AS n
    FROM coverage_records
    WHERE operator = 'Nio'
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 5
  `);
  if (nioTripleSample.rows.length) {
    console.log("\n  Amostra Nio (CEP, fachada, complemento, qtd):");
    for (const r of nioTripleSample.rows) {
      console.log(`    ${r.cep_digits} | ${r.dedup_secondary} | "${r.complemento}" | ${r.n}`);
    }
  }

  console.log("\nConcluído.\n");
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
