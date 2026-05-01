import fs from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const loginResponse = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const loginData = await loginResponse.json();
  if (!loginResponse.ok) {
    throw new Error(loginData.message || "Falha no login");
  }

  const tmpFile = path.join(process.cwd(), "tmp-small.csv");
  fs.writeFileSync(tmpFile, "CEP;Cidade\n30130-010;BH\n30330-200;BH\n00000;X\n");

  const form = new FormData();
  form.append("operator", "Vivo");
  form.append("files", new Blob([fs.readFileSync(tmpFile)]), "tmp-small.csv");

  const importResponse = await fetch("http://localhost:4000/api/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${loginData.token}` },
    body: form,
  });
  const importData = await importResponse.json();
  if (!importResponse.ok) {
    throw new Error(importData.message || "Falha ao iniciar importação");
  }

  console.log("Job criado:", importData);

  for (let i = 0; i < 20; i += 1) {
    const statusResponse = await fetch(
      `http://localhost:4000/api/import/jobs/${importData.jobId}`,
      { headers: { Authorization: `Bearer ${loginData.token}` } }
    );
    const statusData = await statusResponse.json();
    console.log(
      `status=${statusData.status} total=${statusData.total_rows} processed=${statusData.processed_rows} imported=${statusData.imported_rows} ignored=${statusData.ignored_rows} error=${statusData.error_message || ""}`
    );
    if (statusData.status === "completed" || statusData.status === "failed") {
      break;
    }
    await wait(500);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
