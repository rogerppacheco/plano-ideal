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

async function listServiceDomains(token, serviceId, environmentId) {
  const data = await gql(
    token,
    `query ($serviceId: String!, $environmentId: String!) {
      domains(serviceId: $serviceId, environmentId: $environmentId) {
        serviceDomains { domain }
      }
    }`,
    { serviceId, environmentId }
  );
  const domain = data.domains?.serviceDomains?.[0]?.domain;
  return domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : null;
}

loadEnv();
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/railway-setup.config.json"), "utf8")
);
const token = process.env.RAILWAY_TOKEN;

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

const apiUrl = await listServiceDomains(token, api.id, env.id);
const frontUrl = await listServiceDomains(token, frontend.id, env.id);

console.log(`Projeto: ${project.name} (${env.name})`);
console.log(`API: ${apiUrl || "?"}`);
console.log(`Frontend: ${frontUrl || "?"}`);

if (apiUrl) {
  const health = await fetch(`${apiUrl.replace(/\/$/, "")}/api/health`);
  console.log(`Health: ${health.status} ${await health.text()}`);
}

if (frontUrl) {
  const login = await fetch(`${frontUrl.replace(/\/$/, "")}/interno`);
  console.log(`Login page: ${login.status}`);
}
