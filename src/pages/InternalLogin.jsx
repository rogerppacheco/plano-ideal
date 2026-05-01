import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveSession } from "../lib/authSession";
import { loginInternalUser } from "../services/api";

export default function InternalLogin() {
  const navigate = useNavigate();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const payload = await loginInternalUser({ username: user, password });
      saveSession({
        user: payload.user,
        token: payload.token,
      });
      navigate("/interno/painel");
    } catch (apiError) {
      setError(apiError.message || "Usuário ou senha inválidos.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <h1 className="text-2xl font-extrabold text-slate-900">Área interna</h1>
        <p className="mt-2 text-sm text-slate-600">
          Acesso para equipe consultar operadoras por CEP e, no perfil admin, importar bases.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="user">
              Usuário
            </label>
            <input
              id="user"
              type="text"
              value={user}
              onChange={(event) => setUser(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            Entrar
          </button>
        </form>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>Use credenciais cadastradas no PostgreSQL.</p>
        </div>
      </div>
    </div>
  );
}
