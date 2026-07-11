import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, server } from "../test/setup";

vi.mock("../lib/sessionExit", () => ({
  forceLogout: vi.fn(),
}));

import { forceLogout } from "../lib/sessionExit";
import { ApiError, getCoverageByCep, getImportSummary, loginInternalUser } from "./api";

describe("api interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispara forceLogout ao receber 401 TOKEN_REVOKED em rota autenticada", async () => {
    server.use(
      http.get(`${API_BASE_URL}/coverage/:cep`, () =>
        HttpResponse.json({ message: "Token revogado", code: "TOKEN_REVOKED" }, { status: 401 })
      )
    );

    await expect(getCoverageByCep("01310100", "token-invalido")).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_REVOKED",
    });

    expect(forceLogout).toHaveBeenCalledOnce();
    expect(forceLogout).toHaveBeenCalledWith({
      code: "TOKEN_REVOKED",
      message: "Token revogado",
    });
  });

  it("dispara forceLogout com ACCOUNT_INACTIVE", async () => {
    server.use(
      http.get(`${API_BASE_URL}/import/summary`, () =>
        HttpResponse.json({ message: "Conta inativa", code: "ACCOUNT_INACTIVE" }, { status: 401 })
      )
    );

    await expect(getImportSummary("token-inativo")).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE",
    });

    expect(forceLogout).toHaveBeenCalledWith({
      code: "ACCOUNT_INACTIVE",
      message: "Conta inativa",
    });
  });

  it("não dispara forceLogout em 401 de login (credenciais inválidas)", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json(
          { message: "Usuário ou senha inválidos", code: "INVALID_CREDENTIALS" },
          { status: 401 }
        )
      )
    );

    await expect(
      loginInternalUser({ username: "admin", password: "errada" })
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });

    expect(forceLogout).not.toHaveBeenCalled();
  });

  it("não dispara forceLogout em erros 403", async () => {
    server.use(
      http.get(`${API_BASE_URL}/import/summary`, () =>
        HttpResponse.json({ message: "Sem permissão", code: "FORBIDDEN" }, { status: 403 })
      )
    );

    await expect(getImportSummary("token-sem-permissao")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });

    expect(forceLogout).not.toHaveBeenCalled();
  });

  it("lança NETWORK_ERROR quando fetch falha", async () => {
    server.use(http.get(`${API_BASE_URL}/coverage/:cep`, () => HttpResponse.error()));

    await expect(getCoverageByCep("01310100", "token")).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe("NETWORK_ERROR");
      expect(error.message).toContain("Erro de conexão");
      return true;
    });

    expect(forceLogout).not.toHaveBeenCalled();
  });

  it("lança REQUEST_TIMEOUT quando a requisição é abortada por timeout", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValueOnce(abortError);

    const { updateInternalUserStatus } = await import("./api");

    await expect(
      updateInternalUserStatus({
        userId: 1,
        isActive: false,
        token: "token",
      })
    ).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe("REQUEST_TIMEOUT");
      expect(error.message).toContain("demorou demais");
      return true;
    });

    fetchSpy.mockRestore();
  });
});
