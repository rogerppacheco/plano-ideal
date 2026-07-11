import type { InternalUser, SessionPayload } from "../types/auth";

const AUTH_KEY = "internalAuth";
const USER_KEY = "internalUser";
const TOKEN_KEY = "internalToken";

export function saveSession({ user, token }: SessionPayload): void {
  sessionStorage.setItem(AUTH_KEY, "ok");
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearSession(): void {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getSessionUser(): InternalUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as InternalUser) : null;
  } catch {
    return null;
  }
}

export function getSessionToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function isSessionAuthenticated(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === "ok" && Boolean(getSessionToken());
}
