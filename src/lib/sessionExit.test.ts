import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSession } from "./authSession";

const EXIT_REASON_KEY = "planoideal_session_exit";

async function loadSessionExit() {
  vi.resetModules();
  return import("./sessionExit");
}

describe("sessionExit", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  describe("getSessionExitMessage", () => {
    it("retorna mensagem específica para TOKEN_REVOKED", async () => {
      const { getSessionExitMessage } = await loadSessionExit();
      expect(getSessionExitMessage("TOKEN_REVOKED")).toContain("senha, perfil ou status");
    });

    it("retorna mensagem específica para ACCOUNT_INACTIVE", async () => {
      const { getSessionExitMessage } = await loadSessionExit();
      expect(getSessionExitMessage("ACCOUNT_INACTIVE")).toContain("inativada");
    });

    it("retorna mensagem específica para INVALID_TOKEN", async () => {
      const { getSessionExitMessage } = await loadSessionExit();
      expect(getSessionExitMessage("INVALID_TOKEN")).toContain("expirou");
    });

    it("usa fallback customizado quando o código é desconhecido", async () => {
      const { getSessionExitMessage } = await loadSessionExit();
      expect(getSessionExitMessage("CUSTOM", "Mensagem customizada")).toBe("Mensagem customizada");
    });

    it("usa UNAUTHORIZED como padrão sem fallback", async () => {
      const { getSessionExitMessage } = await loadSessionExit();
      expect(getSessionExitMessage("UNKNOWN")).toContain("Sessão inválida");
    });
  });

  describe("consumeSessionExitNotice", () => {
    it("lê e remove o aviso do sessionStorage", async () => {
      const { consumeSessionExitNotice } = await loadSessionExit();
      sessionStorage.setItem(
        EXIT_REASON_KEY,
        JSON.stringify({ code: "TOKEN_REVOKED", message: "Sessão encerrada", at: Date.now() })
      );

      expect(consumeSessionExitNotice()).toBe("Sessão encerrada");
      expect(sessionStorage.getItem(EXIT_REASON_KEY)).toBeNull();
    });

    it("retorna null quando não há aviso", async () => {
      const { consumeSessionExitNotice } = await loadSessionExit();
      expect(consumeSessionExitNotice()).toBeNull();
    });

    it("remove chave inválida e retorna null em JSON corrompido", async () => {
      const { consumeSessionExitNotice } = await loadSessionExit();
      sessionStorage.setItem(EXIT_REASON_KEY, "{invalid-json");

      expect(consumeSessionExitNotice()).toBeNull();
      expect(sessionStorage.getItem(EXIT_REASON_KEY)).toBeNull();
    });
  });

  describe("forceLogout", () => {
    it("persiste aviso, limpa sessão e chama handler registrado", async () => {
      const { forceLogout, registerForcedLogoutHandler } = await loadSessionExit();
      const handler = vi.fn();
      registerForcedLogoutHandler(handler);

      saveSession({
        user: {
          id: 1,
          username: "admin",
          fullName: "Admin",
          role: "admin",
          isActive: true,
        },
        token: "token-ativo",
      });

      forceLogout({ code: "TOKEN_REVOKED" });

      const stored = JSON.parse(sessionStorage.getItem(EXIT_REASON_KEY) ?? "null") as {
        code: string;
        message: string;
      };
      expect(stored.code).toBe("TOKEN_REVOKED");
      expect(stored.message).toContain("senha, perfil ou status");
      expect(sessionStorage.getItem("internalToken")).toBeNull();
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(stored.message);
    });

    it("redireciona para /interno quando não há handler registrado", async () => {
      const { forceLogout } = await loadSessionExit();
      const assign = vi.fn();
      vi.stubGlobal("location", { assign });

      saveSession({
        user: {
          id: 1,
          username: "admin",
          fullName: "Admin",
          role: "admin",
          isActive: true,
        },
        token: "token-ativo",
      });

      forceLogout({ code: "ACCOUNT_INACTIVE" });

      expect(assign).toHaveBeenCalledWith("/interno");
      expect(sessionStorage.getItem("internalToken")).toBeNull();
      vi.unstubAllGlobals();
    });

    it("é idempotente enquanto o logout forçado está em andamento", async () => {
      vi.useFakeTimers();
      const { forceLogout, registerForcedLogoutHandler } = await loadSessionExit();
      const handler = vi.fn();
      registerForcedLogoutHandler(handler);

      forceLogout({ code: "TOKEN_REVOKED" });
      forceLogout({ code: "TOKEN_REVOKED" });

      expect(handler).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(500);
      forceLogout({ code: "INVALID_TOKEN" });
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
