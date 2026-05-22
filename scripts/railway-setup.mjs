/**
 * Configura Railway: serviço API (backend), variáveis, domínios e frontend.
 * Requer RAILWAY_TOKEN (https://railway.com/account/tokens)
 *
 * Uso:
 *   cp .env.railway.example .env.railway   # preencha o token e DATABASE_URL
 *   node scripts/railway-setup.mjs
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
  for (const line of text.split("\n")) {
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
}

function loadConfig() {
  const configPath = path.join(__dirname, "railway-setup.config.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
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
    const msg = json.errors.map((e) => e.message).join("; ");
    throw new Error(msg);
  }
  return json.data;
}

async function listProjects(token) {
  const query = `
    query {
      me {
        workspaces {
          id
          name
          projects {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  `;
  const data = await gql(token, query);
  const list = [];
  for (const workspace of data.me?.workspaces || []) {
    for (const edge of workspace.projects?.edges || []) {
      list.push({ ...edge.node, workspaceName: workspace.name });
    }
  }
  if (list.length) return list;
  throw new Error("Não foi possível listar projetos. Verifique o RAILWAY_TOKEN.");
}

async function getProjectDetails(token, projectId) {
  const query = `
    query ($projectId: String!) {
      project(id: $projectId) {
        id
        name
        services {
          edges {
            node {
              id
              name
            }
          }
        }
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `;
  const data = await gql(token, query, { projectId });
  return data.project;
}

async function createServiceFromRepo(token, projectId, name, repo) {
  const mutations = [
    {
      query: `
        mutation ($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `,
      variables: {
        input: {
          projectId,
          name,
          source: { repo },
        },
      },
    },
    {
      query: `
        mutation ($projectId: String!, $name: String!, $repo: String!) {
          serviceCreate(
            input: { projectId: $projectId, name: $name, source: { repo: $repo } }
          ) {
            id
            name
          }
        }
      `,
      variables: { projectId, name, repo },
    },
  ];
  for (const m of mutations) {
    try {
      const data = await gql(token, m.query, m.variables);
      return data.serviceCreate;
    } catch {
      // próxima forma
    }
  }
  throw new Error(
    `Não foi possível criar o serviço "${name}". Crie manualmente no painel e rode o script de novo.`
  );
}

async function updateServiceInstance(token, serviceId, environmentId, input) {
  const query = `
    mutation ($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }
  `;
  await gql(token, query, { serviceId, environmentId, input });
}

async function upsertVariables(token, projectId, environmentId, serviceId, variables) {
  const query = `
    mutation ($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;
  await gql(token, query, {
    input: {
      projectId,
      environmentId,
      serviceId,
      variables,
      replace: false,
    },
  });
}

async function createRailwayDomain(token, serviceId, environmentId) {
  const attempts = [
    {
      query: `
        mutation ($input: ServiceDomainCreateInput!) {
          serviceDomainCreate(input: $input) {
            id
            domain
          }
        }
      `,
      variables: { input: { serviceId, environmentId } },
      pick: (d) => d.serviceDomainCreate,
    },
    {
      query: `
        mutation ($serviceId: String!, $environmentId: String!) {
          serviceDomainCreate(
            serviceId: $serviceId
            environmentId: $environmentId
          ) {
            id
            domain
          }
        }
      `,
      variables: { serviceId, environmentId },
      pick: (d) => d.serviceDomainCreate,
    },
  ];
  for (const a of attempts) {
    try {
      const data = await gql(token, a.query, a.variables);
      const result = a.pick(data);
      const domain = result?.domain;
      if (domain) return domain.startsWith("http") ? domain : `https://${domain}`;
    } catch {
      // próximo formato
    }
  }
  return null;
}

async function listServiceDomains(token, serviceId, environmentId) {
  try {
    const query = `
      query ($serviceId: String!, $environmentId: String!) {
        domains(serviceId: $serviceId, environmentId: $environmentId) {
          serviceDomains {
            domain
          }
        }
      }
    `;
    const data = await gql(token, query, { serviceId, environmentId });
    const list = data.domains?.serviceDomains || [];
    const d = list[0]?.domain;
    if (d) return d.startsWith("http") ? d : `https://${d}`;
  } catch {
    // ignore
  }
  return null;
}

async function deployService(token, serviceId, environmentId) {
  try {
    const query = `
      mutation ($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
      }
    `;
    await gql(token, query, { serviceId, environmentId });
  } catch {
    // deploy opcional
  }
}

function findService(services, name) {
  return services.find((s) => s.name === name);
}

function findEnvironment(environments, name) {
  return (
    environments.find((e) => e.name === name) ||
    environments.find((e) => e.name === "Production") ||
    environments[0]
  );
}

async function main() {
  loadEnvRailway();
  const config = loadConfig();
  const token = process.env.RAILWAY_TOKEN;
  if (!token) {
    console.error(`
ERRO: RAILWAY_TOKEN não definido.

1. Abra https://railway.com/account/tokens e crie um token.
2. Copie .env.railway.example para .env.railway
3. Cole RAILWAY_TOKEN=... e DATABASE_URL=...
4. Rode: node scripts/railway-setup.mjs

Ou no PowerShell:
  $env:RAILWAY_TOKEN = "seu-token"
  node scripts/railway-setup.mjs
`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERRO: defina DATABASE_URL em .env.railway");
    process.exit(1);
  }

  const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

  console.log("\n=== Railway Setup — Plano Ideal ===\n");

  let projectId = process.env.RAILWAY_PROJECT_ID;
  let project;

  if (projectId) {
    project = await getProjectDetails(token, projectId);
  } else {
    const projects = await listProjects(token);
    project = projects.find((p) => p.name === config.projectName);
    if (!project) {
      console.error("Projetos encontrados:", projects.map((p) => p.name).join(", "));
      throw new Error(`Projeto "${config.projectName}" não encontrado.`);
    }
    projectId = project.id;
    project = await getProjectDetails(token, projectId);
  }

  const env = findEnvironment(
    project.environments.edges.map((e) => e.node),
    config.environmentName
  );
  if (!env) throw new Error("Ambiente não encontrado.");

  const services = project.services.edges.map((e) => e.node);
  console.log(`Projeto: ${project.name} (${projectId})`);
  console.log(`Ambiente: ${env.name} (${env.id})`);
  console.log(`Serviços: ${services.map((s) => s.name).join(", ") || "(nenhum)"}\n`);

  let frontend = findService(services, config.frontendServiceName);
  let api = findService(services, config.apiServiceName);

  if (!frontend) {
    throw new Error(
      `Serviço frontend "${config.frontendServiceName}" não encontrado. Conecte o repo no Railway primeiro.`
    );
  }

  if (!api) {
    console.log(`Criando serviço API "${config.apiServiceName}"…`);
    api = await createServiceFromRepo(token, projectId, config.apiServiceName, config.githubRepo);
    console.log(`  Criado: ${api.name} (${api.id})`);
  }

  console.log("Configurando Root Directory da API → backend…");
  await updateServiceInstance(token, api.id, env.id, {
    rootDirectory: config.apiRootDirectory,
  });

  console.log("Gerando domínio da API…");
  let apiUrl = await listServiceDomains(token, api.id, env.id);
  if (!apiUrl) {
    apiUrl = await createRailwayDomain(token, api.id, env.id);
  }
  if (!apiUrl) {
    console.warn("  Não foi possível gerar domínio via API. Gere em Settings → Networking.");
    apiUrl = "https://CONFIGURE-API-DOMAIN.up.railway.app";
  }
  const apiBase = apiUrl.replace(/\/$/, "");
  const apiHealth = `${apiBase}/api/health`;

  console.log("Variáveis do serviço API…");
  await upsertVariables(token, projectId, env.id, api.id, {
    DATABASE_URL: databaseUrl,
    DB_SCHEMA: config.dbSchema,
    JWT_SECRET: jwtSecret,
    FRONTEND_ORIGIN: "https://placeholder.up.railway.app",
  });

  console.log("Gerando domínio do frontend…");
  let frontendUrl = await listServiceDomains(token, frontend.id, env.id);
  if (!frontendUrl) {
    frontendUrl = await createRailwayDomain(token, frontend.id, env.id);
  }
  if (!frontendUrl) {
    console.warn("  Gere o domínio do frontend em Settings → Networking.");
    frontendUrl = "https://CONFIGURE-FRONTEND-DOMAIN.up.railway.app";
  }
  const frontBase = frontendUrl.replace(/\/$/, "");

  console.log("Variáveis do frontend (VITE_API_BASE_URL)…");
  await upsertVariables(token, projectId, env.id, frontend.id, {
    VITE_API_BASE_URL: `${apiBase}/api`,
  });

  console.log("Atualizando FRONTEND_ORIGIN na API…");
  await upsertVariables(token, projectId, env.id, api.id, {
    FRONTEND_ORIGIN: frontBase,
  });

  console.log("Disparando redeploy…");
  await deployService(token, api.id, env.id);
  await deployService(token, frontend.id, env.id);

  console.log(`
=== Concluído ===

Frontend:  ${frontBase}
API:       ${apiBase}
Health:    ${apiHealth}
Login:     ${frontBase}/interno

Credenciais iniciais (se rodou seed-users): admin / admin123

Guarde o JWT_SECRET gerado (se foi automático):
  ${jwtSecret}

Se o domínio não abrir, confira Networking → Generate Domain em cada serviço.
`);
}

main().catch((err) => {
  console.error("\nFalha:", err.message);
  process.exit(1);
});
