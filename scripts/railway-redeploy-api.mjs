/**
 * Redeploy apenas do serviço plano-ideal-api no Railway.
 * Uso: node scripts/railway-redeploy-api.mjs
 */
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
  return JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/railway-setup.config.json"), "utf8"));
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

loadEnvRailway();
const token = process.env.RAILWAY_TOKEN;
if (!token) {
  console.error("Defina RAILWAY_TOKEN em .env.railway");
  process.exit(1);
}

const config = loadConfig();
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

if (!api) {
  console.error("Serviço API não encontrado.");
  process.exit(1);
}

await gql(
  token,
  `mutation ($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
  }`,
  { serviceId: api.id, environmentId: env.id }
);

console.log(`Redeploy disparado: ${api.name} (${env.name})`);
console.log("Acompanhe em https://railway.com → Deployments (5–10 min).");
