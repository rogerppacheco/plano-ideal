# Deploy: Railway + GitHub

## O que sobe onde

| Parte | Onde roda | O que vai no GitHub |
|-------|-----------|---------------------|
| **HTML/React** (frontend) | Serviço Railway em `comparador-leads` | Código em `src/`, build gera `dist/` no deploy |
| **API Node** (backend) | Serviço Railway em `comparador-leads/backend` | Código em `backend/src/` |
| **Schema do banco** | Postgres compartilhado (Railway) | Arquivo `backend/sql/init.sql` + script `setup-schema.js` |

O banco **não** é enviado ao GitHub — só o **SQL do schema** (`init.sql`). Os dados ficam no PostgreSQL.

## GitHub

1. Crie um repositório vazio em https://github.com/new (sem README).
2. No projeto:

```powershell
cd c:\PlanoIdeal\comparador-leads
git remote add origin https://github.com/SEU_USUARIO/plano-ideal.git
git push -u origin master
```

Troque `SEU_USUARIO/plano-ideal` pelo nome do seu repositório.

## Railway — 2 serviços

### 1) API (backend)

- **Root Directory:** `comparador-leads/backend` (se o repo for só `comparador-leads`, use `backend`)
- **Variáveis:** `DATABASE_URL`, `DB_SCHEMA=plano_ideal`, `JWT_SECRET`, `FRONTEND_ORIGIN`
- **Start:** `npm start`

Na primeira vez (local, com URL de produção no `.env`):

```powershell
cd backend
npm run setup-schema
npm run seed-users
```

### 2) Frontend (HTML/React)

- **Root Directory:** `comparador-leads` (raiz do frontend)
- **Build:** automático (`npm run build` via `railway.toml`)
- **Variável de build:** `VITE_API_BASE_URL=https://SUA-API.up.railway.app/api`
- **Start:** `npm run start`

Depois do deploy do frontend, copie a URL pública para `FRONTEND_ORIGIN` na API.

## Ordem recomendada

1. Push no GitHub
2. Conectar repositório no Railway (serviço API)
3. Conectar o mesmo repo no Railway (serviço Frontend, outra root)
4. `setup-schema` + `seed-users` no banco (se ainda não rodou)
5. Testar `/api/health` e abrir a URL do frontend
