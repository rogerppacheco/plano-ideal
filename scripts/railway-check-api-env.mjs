import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://backboard.railway.com/graphql/v2";

function loadEnv() {
  for (const line of fs.readFileSync(path.join(ROOT, ".env.railway"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

async function gql(token, query, variables = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

loadEnv();
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/railway-setup.config.json"), "utf8")
);
const token = process.env.RAILWAY_TOKEN;

const data = await gql(
  token,
  `query { me { workspaces { projects { edges { node { id name services { edges { node { id name } } } environments { edges { node { id name } } } } } } } } }`
);
const projects = data.me.workspaces.flatMap((w) => w.projects.edges.map((e) => e.node));
const project = projects.find((p) => p.name === config.projectName) || projects[0];
const env =
  project.environments.edges.map((e) => e.node).find((e) => e.name === "production") ||
  project.environments.edges[0].node;
const api = project.services.edges.map((e) => e.node).find((s) => s.name === config.apiServiceName);

const vars = await gql(
  token,
  `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
    variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
  }`,
  { projectId: project.id, environmentId: env.id, serviceId: api.id }
);

const keys = ["DATABASE_URL", "JWT_SECRET", "FRONTEND_ORIGIN", "DB_SCHEMA", "PORT"];
for (const key of keys) {
  const value = vars.variables?.[key];
  if (!value) {
    console.log(`${key}: (ausente)`);
    continue;
  }
  if (key === "DATABASE_URL") {
    const host = value.split("@")[1]?.split("/")[0] || "?";
    console.log(`${key}: host=${host}`);
  } else if (key === "JWT_SECRET") {
    console.log(`${key}: definido (${value.length} chars)`);
  } else {
    console.log(`${key}: ${value}`);
  }
}

const localDb = process.env.DATABASE_URL || "";
console.log("local .env.railway host:", localDb.split("@")[1]?.split("/")[0] || "?");
