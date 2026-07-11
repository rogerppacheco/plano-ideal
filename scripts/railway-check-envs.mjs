import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://backboard.railway.com/graphql/v2";

function loadEnv() {
  const envPath = path.join(ROOT, ".env.railway");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
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

loadEnv();
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/railway-setup.config.json"), "utf8")
);
const token = process.env.RAILWAY_TOKEN;
if (!token) {
  console.error("RAILWAY_TOKEN ausente");
  process.exit(1);
}

const EXPECTED = {
  VITE_API_BASE_URL: "https://plano-ideal-api-production.up.railway.app/api",
  FRONTEND_ORIGIN: "https://plano-ideal-production.up.railway.app",
};

const data = await gql(
  token,
  `query {
    me {
      workspaces {
        projects {
          edges {
            node {
              id
              name
              services { edges { node { id name } } }
              environments { edges { node { id name } } }
            }
          }
        }
      }
    }
  }`
);

const projects = [];
for (const workspace of data.me.workspaces) {
  for (const edge of workspace.projects.edges) {
    projects.push(edge.node);
  }
}

const project = projects.find((p) => p.name === config.projectName) || projects[0];
const services = project.services.edges.map((e) => e.node);
const environments = project.environments.edges.map((e) => e.node);
const env =
  environments.find((e) => e.name === config.environmentName) ||
  environments.find((e) => e.name === "production") ||
  environments[0];
const api = services.find((s) => s.name === config.apiServiceName);
const frontend = services.find((s) => s.name === config.frontendServiceName);

async function getVariables(serviceId) {
  const result = await gql(
    token,
    `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId: project.id, environmentId: env.id, serviceId }
  );
  return result.variables || {};
}

const frontVars = await getVariables(frontend.id);
const apiVars = await getVariables(api.id);

const vite = frontVars.VITE_API_BASE_URL;
const origin = apiVars.FRONTEND_ORIGIN;

console.log("=== Checklist pré-deploy ===");
console.log(`Frontend VITE_API_BASE_URL: ${vite || "(ausente)"}`);
console.log(`  esperado: ${EXPECTED.VITE_API_BASE_URL}`);
console.log(`  ok: ${vite === EXPECTED.VITE_API_BASE_URL}`);
console.log(`Backend FRONTEND_ORIGIN: ${origin || "(ausente)"}`);
console.log(`  esperado: ${EXPECTED.FRONTEND_ORIGIN}`);
console.log(`  ok: ${origin === EXPECTED.FRONTEND_ORIGIN}`);

let fixed = false;
if (vite !== EXPECTED.VITE_API_BASE_URL) {
  await gql(
    token,
    `mutation ($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }`,
    {
      input: {
        projectId: project.id,
        environmentId: env.id,
        serviceId: frontend.id,
        name: "VITE_API_BASE_URL",
        value: EXPECTED.VITE_API_BASE_URL,
      },
    }
  );
  console.log("Corrigido: VITE_API_BASE_URL");
  fixed = true;
}

if (origin !== EXPECTED.FRONTEND_ORIGIN) {
  await gql(
    token,
    `mutation ($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }`,
    {
      input: {
        projectId: project.id,
        environmentId: env.id,
        serviceId: api.id,
        name: "FRONTEND_ORIGIN",
        value: EXPECTED.FRONTEND_ORIGIN,
      },
    }
  );
  console.log("Corrigido: FRONTEND_ORIGIN");
  fixed = true;
}

if (!fixed) {
  console.log("Variáveis OK — sem correção necessária.");
}
