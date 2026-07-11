import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import mascotHero from "../assets/mascot-cloud-hero.png";
import { FormField } from "../components/ui/FormField";
import { useToast } from "../components/ui/Toast";
import { saveSession } from "../lib/authSession";
import { consumeSessionExitNotice } from "../lib/sessionExit";
import { ApiError, getApiBaseUrl, loginInternalUser } from "../services/api";

type LoginSubmitState =
  { status: "idle" } | { status: "submitting" } | { status: "error"; message: string };

interface LoginLocationState {
  sessionExit?: string;
}

function LoginBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-24 top-1/4 h-96 w-96 animate-blob-drift rounded-full bg-green-500 opacity-35 mix-blend-screen blur-[120px]" />
      <div
        className="absolute right-[-4rem] top-1/3 h-[28rem] w-[28rem] animate-blob-drift rounded-full bg-green-400 opacity-25 mix-blend-screen blur-[120px]"
        style={{ animationDelay: "-4s" }}
      />
      <div
        className="absolute bottom-[-6rem] left-1/2 h-96 w-96 -translate-x-1/2 animate-blob-drift rounded-full bg-emerald-500 opacity-30 mix-blend-screen blur-[120px]"
        style={{ animationDelay: "-8s" }}
      />
    </div>
  );
}

export default function InternalLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [submitState, setSubmitState] = useState<LoginSubmitState>({ status: "idle" });
  const [sessionExitMessage, setSessionExitMessage] = useState("");

  const error = submitState.status === "error" ? submitState.message : "";
  const isSubmitting = submitState.status === "submitting";

  useEffect(() => {
    const state = location.state as LoginLocationState | null;
    const fromNavigation = state?.sessionExit;
    const fromStorage = consumeSessionExitNotice();
    const message = fromNavigation || fromStorage;
    if (message) {
      setSessionExitMessage(message);
      navigate("/interno", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitState({ status: "idle" });

    const loginUrl = `${getApiBaseUrl()}/auth/login`;

    try {
      setSubmitState({ status: "submitting" });
      const payload = await loginInternalUser({ username: user, password });
      saveSession({
        user: payload.user,
        token: payload.token,
      });
      toast.success(`Bem-vindo, ${payload.user.name ?? payload.user.fullName ?? user}!`);
      navigate("/interno/painel");
    } catch (error: unknown) {
      const apiError = error instanceof ApiError ? error : null;
      // eslint-disable-next-line no-console
      console.error("[Login] Falha no login:", {
        url: apiError?.url || loginUrl,
        code: apiError?.code,
        status: apiError?.status,
        message: apiError?.message ?? (error instanceof Error ? error.message : String(error)),
        viteApiBase: import.meta.env.VITE_API_BASE_URL ?? "(não definida no build)",
      });

      const message =
        apiError?.code === "NETWORK_ERROR"
          ? apiError.message
          : apiError?.message ||
            (error instanceof Error ? error.message : null) ||
            "Usuário ou senha inválidos.";

      setSubmitState({ status: "error", message });
      toast.error(message);
    }
  };

  return (
    <div className="hero-mesh relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <LoginBackground />

      <div className="relative z-10 w-full max-w-md">
        <div className="relative mt-16 rounded-[2rem] border border-white/20 bg-white/10 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-8">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 z-20 w-[min(100%,18rem)] -translate-x-1/2 sm:-top-28 sm:w-[20rem]"
            aria-hidden="true"
          >
            <div className="animate-float relative">
              <div className="absolute bottom-2 left-1/2 h-8 w-[70%] -translate-x-1/2 rounded-[100%] bg-black/45 blur-xl" />
              <img
                src={mascotHero}
                alt=""
                className="relative z-10 mx-auto h-auto w-full object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
                width={320}
                height={320}
                decoding="async"
              />
            </div>
          </div>

          <div className="relative z-10 pt-20 text-center sm:pt-24">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neon-green">
              Plano Ideal
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">Área interna</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/65">
              Consulta de CEP, crédito e importações conforme o seu perfil de acesso.
            </p>
          </div>

          {sessionExitMessage ? (
            <div
              className="relative z-10 mt-5 rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-left"
              role="alert"
            >
              <p className="text-sm font-semibold text-amber-100">Sessão encerrada</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-50/90">{sessionExitMessage}</p>
            </div>
          ) : null}

          <form className="relative z-10 mt-6 space-y-4" onSubmit={handleSubmit}>
            <FormField id="login-user" label="Usuário" required>
              {({ id }) => (
                <input
                  id={id}
                  type="text"
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                  className="input-modern login-input"
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
                  className="input-modern login-input"
                  autoComplete="current-password"
                  aria-describedby={describedBy}
                  aria-invalid={ariaInvalid}
                  required
                />
              )}
            </FormField>

            <button
              type="submit"
              className="btn-primary login-submit w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <p className="relative z-10 mt-5 text-center text-xs text-white/45">
            Credenciais cadastradas no painel administrativo.
          </p>
        </div>
      </div>
    </div>
  );
}
