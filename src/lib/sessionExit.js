import { clearSession } from "./authSession";

export const EXIT_REASON_KEY = "planoideal_session_exit";

const EXIT_MESSAGES = {
  TOKEN_REVOKED:
    "Sua sessão foi encerrada porque sua senha, perfil ou status de acesso foi alterado. Faça login novamente.",
  ACCOUNT_INACTIVE:
    "Sua conta foi inativada. Entre em contato com o administrador do sistema.",
  INVALID_TOKEN: "Sua sessão expirou. Faça login novamente para continuar.",
  USER_NOT_FOUND: "Usuário não encontrado. Faça login novamente.",
  UNAUTHORIZED: "Sessão inválida. Faça login novamente.",
};

let forcedLogoutHandler = null;
let isHandlingForcedLogout = false;

export function getSessionExitMessage(code, fallbackMessage) {
  return EXIT_MESSAGES[code] || fallbackMessage || EXIT_MESSAGES.UNAUTHORIZED;
}

export function registerForcedLogoutHandler(handler) {
  forcedLogoutHandler = handler;
}

export function consumeSessionExitNotice() {
  try {
    const raw = sessionStorage.getItem(EXIT_REASON_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(EXIT_REASON_KEY);
    const parsed = JSON.parse(raw);
    return parsed?.message || null;
  } catch {
    sessionStorage.removeItem(EXIT_REASON_KEY);
    return null;
  }
}

export function forceLogout({ code, message }) {
  if (isHandlingForcedLogout) return;
  isHandlingForcedLogout = true;

  const finalMessage = getSessionExitMessage(code, message);
  sessionStorage.setItem(
    EXIT_REASON_KEY,
    JSON.stringify({ code, message: finalMessage, at: Date.now() })
  );
  clearSession();

  if (forcedLogoutHandler) {
    forcedLogoutHandler(finalMessage);
  } else {
    window.location.assign("/interno");
  }

  window.setTimeout(() => {
    isHandlingForcedLogout = false;
  }, 500);
}
