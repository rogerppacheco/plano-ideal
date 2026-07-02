/**
 * Deploy completo: API + frontend + worker PAP (consulta crédito).
 * Requer RAILWAY_TOKEN e DATABASE_URL em .env.railway
 *
 * Uso: node scripts/railway-deploy-credit.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const API_URL = "https://backboard.railway.com/graphql/v2";

function loadEnvRailway() {
  const envPath = path.join(ROOT, ".env.railway");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  const lines = text.split("\n");
  let changed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }

  if (!process.env.PAP_CREDENTIALS_SECRET) {
    process.env.PAP_CREDENTIALS_SECRET = crypto.randomBytes(32).toString("base64");
    lines.push(`PAP_CREDENTIALS_SECRET=${process.env.PAP_CREDENTIALS_SECRET}`);
    fs.writeFileSync(envPath, `${lines.join("\n").trim()}\n`, "utf8");
    changed = true;
    console.log("PAP_CREDENTIALS_SECRET gerado e salvo em .env.railway");
  }

  return changed;
}

function loadConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "railway-setup.config.json"), "utf8")
  );
}

async function gql(token, query, variables = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

async function listProjects(token) {
  const data = await gql(
    token,
    `
    query {
      me {
        workspaces {
          projects {
            edges {
              node { id name }
            }
          }
        }
      }
    }
  `
  );
  const list = [];
  for (const workspace of data.me?.workspaces || []) {
    for (const edge of workspace.projects?.edges || []) {
      list.push(edge.node);
    }
  }
  return list;
}

async function getProjectDetails(token, projectId) {
  const data = await gql(
    token,
    `
    query ($projectId: String!) {
      project(id: $projectId) {
        id
        name
        services { edges { node { id name } } }
        environments { edges { node { id name } } }
      }
    }
  `,
    { projectId }
  );
  return data.project;
}

async function createServiceFromRepo(token, projectId, name, repo) {
  const data = await gql(
    token,
    `
      mutation ($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `,
    {
      input: {
        projectId,
        name,
        source: { repo },
      },
    }
  );
  return data.serviceCreate;
}

async function updateServiceInstance(token, serviceId, environmentId, input) {
  await gql(
    token,
    `
    mutation ($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }
  `,
    { serviceId, environmentId, input }
  );
}

async function upsertVariables(token, projectId, environmentId, serviceId, variables) {
  await gql(token, `mutation ($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`, {
    input: {
      projectId,
      environmentId,
      serviceId,
      variables,
      replace: false,
    },
  });
}

async function deployService(token, serviceId, environmentId, serviceName) {
  await gql(
    token,
    `
    mutation ($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }
  `,
    { serviceId, environmentId }
  );
  console.log(`  Deploy disparado: ${serviceName}`);
}

loadEnvRailway();
const token = process.env.RAILWAY_TOKEN;
if (!token) {
  console.error("Defina RAILWAY_TOKEN em .env.railway");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Defina DATABASE_URL em .env.railway");
  process.exit(1);
}

const config = loadConfig();
const papServiceName = config.papServiceName || "plano-ideal-pap";
const papRootDirectory = config.papRootDirectory || "pap-worker";

const projects = await listProjects(token);
const project =
  projects.find((p) => p.name === config.projectName) ||
  projects.find((p) => p.name?.toLowerCase().includes("cooperative")) ||
  projects[0];

if (!project) {
  console.error("Projeto Railway não encontrado.");
  process.exit(1);
}

const details = await getProjectDetails(token, project.id);
const services = details.services.edges.map((e) => e.node);
const environments = details.environments.edges.map((e) => e.node);
const env =
  environments.find((e) => e.name === config.environmentName) ||
  environments.find((e) => e.name === "production") ||
  environments[0];

let api = services.find((s) => s.name === config.apiServiceName);
let frontend = services.find((s) => s.name === config.frontendServiceName);
let pap = services.find((s) => s.name === papServiceName);

console.log(`\n=== Deploy consulta crédito — ${details.name} ===\n`);

if (!api || !frontend) {
  console.error("Serviços API ou frontend não encontrados.");
  process.exit(1);
}

if (!pap) {
  console.log(`Criando serviço ${papServiceName}…`);
  pap = await createServiceFromRepo(token, project.id, papServiceName, config.githubRepo);
  console.log(`  Criado: ${pap.name} (${pap.id})`);
}

console.log(`Configurando ${papServiceName} → root ${papRootDirectory}…`);
await updateServiceInstance(token, pap.id, env.id, {
  rootDirectory: papRootDirectory,
});

const papSecret = process.env.PAP_CREDENTIALS_SECRET;

console.log("Variáveis API (PAP_CREDENTIALS_SECRET)…");
await upsertVariables(token, project.id, env.id, api.id, {
  PAP_CREDENTIALS_SECRET: papSecret,
});

console.log(`Variáveis ${papServiceName}…`);
await upsertVariables(token, project.id, env.id, pap.id, {
  DATABASE_URL: databaseUrl,
  DB_SCHEMA: config.dbSchema,
  PAP_CREDENTIALS_SECRET: papSecret,
  PAP_HEADLESS: "true",
  PAP_CREDITO_FAST_MODE: "true",
  PAP_CREDITO_MAX_CONSULTAS_POR_TT_DIA: "6",
  PAP_WORKER_POLL_SECONDS: "2",
  PAP_BO_LOCK_TIMEOUT_MINUTES: "30",
});

console.log("\nDisparando deploy…");
await deployService(token, api.id, env.id, api.name);
await deployService(token, frontend.id, env.id, frontend.name);
await deployService(token, pap.id, env.id, pap.name);

console.log(`
=== Deploy iniciado ===

Serviços:
  - ${api.name}
  - ${frontend.name}
  - ${pap.name}

Acompanhe em https://railway.com → Deployments (5–15 min).
Após concluir: painel → aba PAP → cadastre login BackOffice e matrículas TT.
`);
