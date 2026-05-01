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

Edite o arquivo `.env` do backend com sua conexão PostgreSQL e `JWT_SECRET`.

## 3) Banco PostgreSQL

Execute o SQL de criação:

```bash
psql "postgresql://postgres:postgres@localhost:5432/planoideal" -f "./sql/init.sql"
```

Depois crie os usuários internos de acesso:

```bash
node ./scripts/seed-users.js
```

## 4) Subir API

```bash
npm run dev
```

Recomendação: use `npm run dev` (sem `--watch`) durante importações grandes; reinício automático ao salvar arquivos interrompe jobs. Para desenvolvimento com hot reload do Node: `npm run dev:watch`.

API padrão: `http://localhost:4000`

## 5) Fluxo interno

- Login interno: `http://localhost:5173/interno`
- Perfis:
  - admin: consulta CEP + importa bases
  - vendedor: apenas consulta CEP

As credenciais de exemplo são inseridas pelo script `seed-users.js`:

- admin / admin123
- vendedor / vendedor123

## 6) Importação de bases

No painel admin (`/interno/painel`):

1. Escolha a operadora.
2. Selecione arquivos `.xlsx`, `.xls` ou `.csv`.
3. Clique em `Importar base`.

Regras:

- A planilha precisa ter uma coluna com nome contendo `CEP`.
- O CEP é normalizado para 8 dígitos.
- Linhas sem CEP válido são ignoradas.
- Todos os campos da planilha são guardados no `row_data` (JSONB).

### Acompanhamento em tempo real

- No painel, o campo **Etapa atual** mostra o que o worker está fazendo (ler disco, parsear CSV, inserir linhas).
- No terminal do backend, linhas `[import-job ID] ...` registram cada fase com timestamp.
- Enquanto **Linhas processadas** aparecer `0/0`, o arquivo pode estar só na fase de **parse** (normal em CSVs muito grandes).

### Como a importação funciona (memória e disco)

1. O navegador envia o arquivo via `multipart/form-data`.
2. O **multer** grava o upload em arquivo temporário no disco (pasta do sistema), não mantém o arquivo inteiro na RAM do processo principal.
3. Um **worker** lê esse arquivo com `fs.readFileSync` para um **Buffer** e a biblioteca **xlsx** converte a planilha/CSV em um **array de linhas na memória** do worker.
4. Cada linha válida vira um **INSERT** na tabela `coverage_records` (campos completos em JSONB).

**Arquivos `.csv` grandes:** a API usa **streaming** (`csv-parse`): lê linha a linha, atualiza progresso durante a leitura e não faz mais o parse monolítico do pacote `xlsx` (que travava minutos em arquivos ~90 MB).

**Arquivos `.xlsx` / `.xls`:** continuam usando `xlsx` em memória — prefira exportar para CSV quando possível em bases muito grandes.

### Jobs antigos presos

Ao subir a API, jobs em `queued`/`processing` mais antigos que `IMPORT_JOB_STALE_HOURS` (padrão **168 horas = 7 dias**) são marcados como falha. Configure `IMPORT_JOB_STALE_HOURS=0` no `.env` do backend para **desativar** essa limpeza automática.
