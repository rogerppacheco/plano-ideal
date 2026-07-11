import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BalloonMascot } from "../components/BalloonMascot";
import { FloatingBubbles } from "../components/FloatingBubbles";
import { FormField } from "../components/ui/FormField";
import { PanelCard } from "../components/ui/PanelCard";
import { useToast } from "../components/ui/Toast";
import { saveSession } from "../lib/authSession";
import { consumeSessionExitNotice } from "../lib/sessionExit";
import { loginInternalUser } from "../services/api";

export default function InternalLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sessionExitMessage, setSessionExitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fromNavigation = location.state?.sessionExit;
    const fromStorage = consumeSessionExitNotice();
    const message = fromNavigation || fromStorage;
    if (message) {
      setSessionExitMessage(message);
      navigate("/interno", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

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
      <FloatingBubbles variant="dark" />
      <div className="dashboard-container max-w-lg">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="hidden shrink-0 sm:block">
            <BalloonMascot size="md" />
          </div>
          <PanelCard className="flex-1">
            <p className="section-label">Plano Ideal</p>
            <h1 className="mt-1 text-2xl font-extrabold">Área interna</h1>
            <p className="mt-2 text-sm text-white/60">
              Acesso para equipe consultar operadoras por CEP, crédito e, conforme o perfil, importar bases.
            </p>

          {sessionExitMessage ? (
            <div
              className="mt-4 rounded-[1.5rem] border border-amber-400/40 bg-amber-500/10 p-4"
              role="alert"
            >
              <p className="text-sm font-semibold text-amber-100">Sessão encerrada</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-50/90">{sessionExitMessage}</p>
            </div>
          ) : null}

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

          <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-3 text-xs text-white/50">
            <p>Use credenciais cadastradas no PostgreSQL.</p>
          </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
