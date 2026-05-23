# Plano Ideal - Frontend + API PostgreSQL

## 1) Frontend

```bash
cd "c:\PlanoIdeal\comparador-leads"
copy .env.example .env
npm install
npm run dev
```

## 2) Backend API

```bash
cd "c:\PlanoIdeal\comparador-leads\backend"
copy .env.example .env
npm install
```

Edite o `.env` do backend: `DATABASE_URL`, `JWT_SECRET`, `DB_SCHEMA=plano_ideal`.

## 3) Banco PostgreSQL

O Plano Ideal usa o schema **`plano_ideal`**, separado do CRM Record em `public`.

**Criar schema e tabelas:**

```bash
cd backend
npm run setup-schema
npm run seed-users
```

**Auditar antes de produção (banco compartilhado):**

```bash
npm run audit-db
```

Desenvolvimento local com Postgres próprio:

```bash
psql "postgresql://..." -f "./sql/init.sql"
node ./scripts/seed-users.js
```

## 4) Subir API

```bash
npm run dev
```

API padrão: `http://localhost:4000`

## 5) Deploy no Railway (banco compartilhado com Record)

Dois serviços no mesmo projeto Railway:

### Serviço API

| Config | Valor |
|--------|--------|
| Root Directory | `comparador-leads/backend` |
| Start | `npm start` (via `railway.toml`) |

Variáveis:

| Variável | Valor |
|----------|--------|
| `DATABASE_URL` | URL do Postgres (a mesma do Record) |
| `DB_SCHEMA` | `plano_ideal` |
| `JWT_SECRET` | Segredo forte único |
| `FRONTEND_ORIGIN` | URL pública do frontend |
| `IMPORT_JOB_STALE_HOURS` | `168` (opcional) |

Antes do primeiro deploy, na máquina local (com `DATABASE_URL` de produção no `.env`):

```bash
npm run setup-schema
npm run seed-users
```

Troque as senhas padrão do seed em produção.

### Serviço Frontend

| Config | Valor |
|--------|--------|
| Root Directory | `comparador-leads` |
| Build | `npm install && npm run build` |
| Start | `npm run start` |

Variável de build:

| Variável | Valor |
|----------|--------|
| `VITE_API_BASE_URL` | `https://sua-api.up.railway.app/api` |

`DATABASE_SSL` é detectado automaticamente em hosts `*.rlwy.net`. Force com `true` ou `false` se necessário.

## 6) Fluxo interno

- Login: `/interno`
- admin: consulta CEP + importa bases
- vendedor: apenas consulta CEP

Credenciais iniciais (`seed-users.js`): `admin` / `admin123`, `vendedor` / `vendedor123` — altere em produção.

## 7) Importação de bases

No painel admin (`/interno/painel`):

1. Escolha a operadora.
2. Selecione `.xlsx`, `.xls` ou `.csv`.
3. Clique em `Importar base`.

Regras: coluna com `CEP`, 8 dígitos, dados em `plano_ideal.coverage_records`.

### Jobs antigos presos

Jobs `queued`/`processing` mais antigos que `IMPORT_JOB_STALE_HOURS` (padrão 168h) viram falha ao subir a API. Use `0` para desativar.

## 8) Importação em massa FTTH (script local → produção)

Para pastas com dezenas de `.xlsx` no padrão Vivo (colunas `CEP`, `NUM`, etc.), use o script que grava direto no Postgres de produção:

1. Copie `.env.railway.example` → `.env.railway` na raiz do projeto com `DATABASE_URL` do Railway.
2. Não deixe importação aberta no painel (ou use `--force` no script).

```powershell
cd c:\PlanoIdeal\comparador-leads\backend
npm install

# Simular fila (sem gravar)
node ./scripts/import-ftth-folder.mjs "C:\caminho\Endereços FTTH" --dry-run

# Testar 1 arquivo
node ./scripts/import-ftth-folder.mjs "C:\caminho\Endereços FTTH" --from AM_2.xlsx --limit 1 --force

# Carga completa (~147 arquivos, ~18M linhas — várias horas)
node ./scripts/import-ftth-folder.mjs "C:\caminho\Endereços FTTH" --operator Vivo --skip-existing --force
```

Opções: `--skip-existing` (pula já concluídos), `--from ARQUIVO.xlsx` (retomar), `--limit N`, `--dry-run`, `--force` (libera jobs travados no banco).

Cada arquivo gera um `import_job` no histórico do painel. Excel grande no painel ainda pode falhar por memória; o script usa **SheetJS** automaticamente quando o formato FTTH não é lido pelo ExcelJS.

**Guia passo a passo (rápido e seguro):** [docs/IMPORTACAO-FTTH.md](docs/IMPORTACAO-FTTH.md)

Insert em lote (padrão 500 linhas/query, env `IMPORT_BATCH_SIZE`) acelera muito a carga em massa.
