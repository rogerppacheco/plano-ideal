import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormField } from "../components/ui/FormField";
import { PanelCard } from "../components/ui/PanelCard";
import { useToast } from "../components/ui/Toast";
import { saveSession } from "../lib/authSession";
import { loginInternalUser } from "../services/api";

export default function InternalLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setIsSubmitting(true);
      const payload = await loginInternalUser({ username: user, password });
      saveSession({
        user: payload.user,
        token: payload.token,
      });
      toast.success(`Bem-vindo, ${payload.user.name || user}!`);
      navigate("/interno/painel");
    } catch (apiError) {
      const message = apiError.message || "Usuário ou senha inválidos.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container max-w-md">
        <PanelCard>
          <p className="section-label">Plano Ideal</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Área interna</h1>
          <p className="mt-2 text-sm text-slate-600">
            Acesso para equipe consultar operadoras por CEP e, no perfil admin, importar bases.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <FormField id="login-user" label="Usuário" required>
              {({ id }) => (
                <input
                  id={id}
                  type="text"
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                  className="input-modern"
                  autoComplete="username"
                  required
                />
              )}
            </FormField>

            <FormField id="login-password" label="Senha" error={error} required>
              {({ id, describedBy, "aria-invalid": ariaInvalid }) => (
                <input
                  id={id}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input-modern"
                  autoComplete="current-password"
                  aria-describedby={describedBy}
                  aria-invalid={ariaInvalid}
                  required
                />
              )}
            </FormField>

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p>Use credenciais cadastradas no PostgreSQL.</p>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
