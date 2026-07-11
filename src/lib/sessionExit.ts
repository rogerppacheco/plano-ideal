import { clearSession } from "./authSession";
import type { ApiErrorCode } from "../types/api";

export const EXIT_REASON_KEY = "planoideal_session_exit";

const EXIT_MESSAGES: Record<string, string> = {
  TOKEN_REVOKED:
    "Sua sessão foi encerrada porque sua senha, perfil ou status de acesso foi alterado. Faça login novamente.",
  ACCOUNT_INACTIVE: "Sua conta foi inativada. Entre em contato com o administrador do sistema.",
  INVALID_TOKEN: "Sua sessão expirou. Faça login novamente para continuar.",
  USER_NOT_FOUND: "Usuário não encontrado. Faça login novamente.",
  UNAUTHORIZED: "Sessão inválida. Faça login novamente.",
};

export type ForcedLogoutHandler = (message: string) => void;

export interface ForceLogoutParams {
  code?: ApiErrorCode;
  message?: string;
}

interface SessionExitNotice {
  code?: ApiErrorCode;
  message?: string;
  at?: number;
}

let forcedLogoutHandler: ForcedLogoutHandler | null = null;
let isHandlingForcedLogout = false;

export function getSessionExitMessage(code?: string, fallbackMessage?: string): string {
  return EXIT_MESSAGES[code ?? ""] || fallbackMessage || EXIT_MESSAGES.UNAUTHORIZED;
}

export function registerForcedLogoutHandler(handler: ForcedLogoutHandler | null): void {
  forcedLogoutHandler = handler;
}

export function consumeSessionExitNotice(): string | null {
  try {
    const raw = sessionStorage.getItem(EXIT_REASON_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(EXIT_REASON_KEY);
    const parsed = JSON.parse(raw) as SessionExitNotice;
    return parsed?.message || null;
  } catch {
    sessionStorage.removeItem(EXIT_REASON_KEY);
    return null;
  }
}

export function forceLogout({ code, message }: ForceLogoutParams): void {
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
