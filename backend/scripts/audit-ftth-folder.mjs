/**
 * Audita pasta de bases FTTH: cabeçalhos, CEP, operadora sugerida.
 * Uso: node ./scripts/audit-ftth-folder.mjs "C:\caminho\Endereços FTTH"
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const folder = process.argv[2];
if (!folder || !fs.existsSync(folder)) {
  console.error("Uso: node audit-ftth-folder.mjs <pasta>");
  process.exit(1);
}

const files = fs
  .readdirSync(folder)
  .filter((f) => /\.(xlsx|xls|csv)$/i.test(f))
  .sort();

function scoreCepHeader(h) {
  const k = String(h || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (k === "cep") return 100;
  if (k.includes("cep")) return 85;
  return 0;
}

function scoreNum(h) {
  const k = String(h || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (k === "num" && !k.includes("fachada")) return 100;
  if (k.includes("fachada")) return 0;
  if (k === "numero" || k.includes("numero")) return 70;
  return 0;
}

function scoreFachada(h) {
  const k = String(h || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (k.includes("fachada") || k === "num_fachada") return 100;
  return 0;
}

async function readHeaders(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/)[0];
    const delim = (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length ? ";" : ",";
    return line.split(delim).map((h) => h.trim().replace(/^"|"$/g, ""));
  }

  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

  for await (const ws of workbook) {
    for await (const row of ws) {
      if (row.number === 1) {
        return (row.values || [])
          .slice(1)
          .map((v) => (v == null ? "" : String(v.text ?? v).trim()));
      }
      break;
    }
    break;
  }
  return [];
}

async function _estimateRows(filePath) {
  let n = 0;
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });
  for await (const ws of workbook) {
    for await (const row of ws) {
      if (row.number > 1) n += 1;
    }
  }
  return n;
}

let totalBytes = 0;
const issues = [];
const summary = [];

for (const name of files) {
  const fp = path.join(folder, name);
  const stat = fs.statSync(fp);
  totalBytes += stat.size;
  try {
    const headers = await readHeaders(fp);
    const cepCol = headers.reduce(
      (best, h, i) => {
        const s = scoreCepHeader(h);
        return s > best.s ? { s, h, i } : best;
      },
      { s: 0, h: "", i: -1 }
    );
    let vivo = 0;
    let nio = 0;
    for (const h of headers) {
      vivo = Math.max(vivo, scoreNum(h));
      nio = Math.max(nio, scoreFachada(h));
    }
    const operatorHint = nio > vivo && nio > 0 ? "Nio" : vivo > 0 ? "Vivo" : "?";
    const ok = cepCol.s >= 85;
    if (!ok) issues.push({ name, problem: "Sem coluna CEP clara", headers: headers.slice(0, 12) });
    summary.push({
      name,
      mb: (stat.size / 1024 / 1024).toFixed(2),
      cols: headers.length,
      cep: cepCol.h || "—",
      operatorHint,
      ok,
    });
  } catch (e) {
    issues.push({ name, problem: e.message });
  }
}

console.log(`\n=== Auditoria FTTH ===\nPasta: ${folder}`);
console.log(
  `Arquivos: ${files.length} | Total: ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB\n`
);

const sample = summary.slice(0, 8);
const sampleBig = [...summary].sort((a, b) => Number(b.mb) - Number(a.mb)).slice(0, 5);
console.log("--- Amostra (primeiros 8) ---");
for (const s of sample) {
  console.log(
    `${s.ok ? "OK" : "!!"} ${s.name} | ${s.mb} MB | CEP="${s.cep}" | operadora~${s.operatorHint} | ${s.cols} colunas`
  );
}
console.log("\n--- Maiores arquivos ---");
for (const s of sampleBig) {
  console.log(`${s.name} | ${s.mb} MB | CEP="${s.cep}" | ${s.operatorHint}`);
}

const okCount = summary.filter((s) => s.ok).length;
const vivoCount = summary.filter((s) => s.operatorHint === "Vivo").length;
const nioCount = summary.filter((s) => s.operatorHint === "Nio").length;
console.log(`\n--- Resumo ---`);
console.log(`Com coluna CEP: ${okCount}/${summary.length}`);
console.log(`Indício Vivo (coluna NUM): ${vivoCount}`);
console.log(`Indício Nio (NUM_FACHADA): ${nioCount}`);
console.log(`Indício indefinido: ${summary.length - vivoCount - nioCount}`);

if (issues.length) {
  console.log(`\n--- Problemas (${issues.length}) ---`);
  for (const i of issues.slice(0, 15)) {
    console.log(`- ${i.name}: ${i.problem}`);
    if (i.headers) console.log(`  headers: ${i.headers.join(" | ")}`);
  }
}

console.log(
  "\n(Dica: para estimar linhas de 1 arquivo, demora — rode com IMPORT_AUDIT_SAMPLE=1)\n"
);
