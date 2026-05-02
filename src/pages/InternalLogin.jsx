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
    <div className="min-h-screen px-4 py-10">
      <div className="surface-card mx-auto max-w-md p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Plano Ideal</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Área interna</h1>
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
              className="input-modern"
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
              className="input-modern"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            className="btn-primary w-full"
          >
            Entrar
          </button>
        </form>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p>Use credenciais cadastradas no PostgreSQL.</p>
        </div>
      </div>
    </div>
  );
}
