/**
 * Valida o fluxo de revogação de sessão (equivalente ao roteiro manual em duas abas).
 * Uso: node ./scripts/validate-session-revocation.mjs
 */
const API_BASE = process.env.API_BASE_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(username, password) {
  const { response, data } = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert(response.ok, `Login ${username} falhou: ${data.message || response.status}`);
  assert(data.token, `Login ${username} sem token`);
  return data;
}

async function authedGet(path, token) {
  return request(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function run() {
  console.log("1) Login admin e operator (duas sessões)…");
  const adminSession = await login("admin", "admin123");
  const operatorSession = await login("vendedor", "vendedor123");

  console.log("2) Operator acessa recurso protegido (antes da inativação)…");
  const before = await authedGet("/coverage/30130-010", operatorSession.token);
  assert(before.response.ok, `Consulta do operator falhou antes da inativação: ${before.data.message}`);

  console.log("3) Admin localiza o operator na lista…");
  const usersRes = await authedGet("/users", adminSession.token);
  assert(usersRes.response.ok, `Listagem de usuários falhou: ${usersRes.data.message}`);
  const operator = (usersRes.data.users || []).find((u) => u.username === "vendedor");
  assert(operator?.id, "Usuário vendedor não encontrado. Rode seed-users.js.");

  console.log("4) Admin inativa o operator…");
  const deactivate = await request(`/users/${operator.id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminSession.token}`,
    },
    body: JSON.stringify({ isActive: false }),
  });
  assert(deactivate.response.ok, `Inativação falhou: ${deactivate.data.message}`);

  console.log("5) Operator tenta nova ação com token antigo…");
  const after = await authedGet("/coverage/30130-010", operatorSession.token);
  assert(after.response.status === 401, `Esperado 401, recebido ${after.response.status}`);
  assert(
    after.data.code === "ACCOUNT_INACTIVE",
    `Esperado ACCOUNT_INACTIVE, recebido ${after.data.code}`
  );
  console.log("   ✓ Backend retornou 401 ACCOUNT_INACTIVE");

  console.log("6) Reativando operator para não deixar ambiente quebrado…");
  const reactivate = await request(`/users/${operator.id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminSession.token}`,
    },
    body: JSON.stringify({ isActive: true }),
  });
  assert(reactivate.response.ok, `Reativação falhou: ${reactivate.data.message}`);

  console.log("7) Teste TOKEN_REVOKED (troca de senha incrementa token_version)…");
  const operatorSession2 = await login("vendedor", "vendedor123");
  const pwdChange = await request(`/users/${operator.id}/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminSession.token}`,
    },
    body: JSON.stringify({ password: "vendedor123" }),
  });
  assert(pwdChange.response.ok, `Troca de senha falhou: ${pwdChange.data.message}`);

  const revoked = await authedGet("/coverage/30130-010", operatorSession2.token);
  assert(revoked.response.status === 401, `Esperado 401 após troca de senha, recebido ${revoked.response.status}`);
  assert(revoked.data.code === "TOKEN_REVOKED", `Esperado TOKEN_REVOKED, recebido ${revoked.data.code}`);
  console.log("   ✓ Backend retornou 401 TOKEN_REVOKED");

  console.log("\n✅ Validação API concluída. Próximo passo manual no navegador:");
  console.log("   - toast de aviso + redirect para /interno");
  console.log("   - banner 'Sessão encerrada' na tela de login (sessionStorage)");
}

run().catch((error) => {
  console.error("\n❌ Falha na validação:", error.message);
  process.exit(1);
});
