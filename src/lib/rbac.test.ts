import { describe, expect, it } from "vitest";
import {
  ROLES,
  buildDashboardTabs,
  canManageImports,
  canManagePap,
  canManageUsers,
  canViewAllCreditHistory,
} from "./rbac";

describe("rbac", () => {
  describe("permissões por papel", () => {
    it("admin tem todas as permissões de gestão", () => {
      expect(canManageUsers(ROLES.ADMIN)).toBe(true);
      expect(canManagePap(ROLES.ADMIN)).toBe(true);
      expect(canManageImports(ROLES.ADMIN)).toBe(true);
      expect(canViewAllCreditHistory(ROLES.ADMIN)).toBe(true);
    });

    it("manager gerencia importações e histórico, mas não usuários nem PAP", () => {
      expect(canManageUsers(ROLES.MANAGER)).toBe(false);
      expect(canManagePap(ROLES.MANAGER)).toBe(false);
      expect(canManageImports(ROLES.MANAGER)).toBe(true);
      expect(canViewAllCreditHistory(ROLES.MANAGER)).toBe(true);
    });

    it("operator não tem permissões administrativas", () => {
      expect(canManageUsers(ROLES.OPERATOR)).toBe(false);
      expect(canManagePap(ROLES.OPERATOR)).toBe(false);
      expect(canManageImports(ROLES.OPERATOR)).toBe(false);
      expect(canViewAllCreditHistory(ROLES.OPERATOR)).toBe(false);
    });
  });

  describe("buildDashboardTabs", () => {
    it("operator vê apenas consulta e crédito", () => {
      const tabs = buildDashboardTabs(ROLES.OPERATOR);
      expect(tabs.map((tab) => tab.id)).toEqual(["consulta", "credito"]);
    });

    it("manager inclui importações", () => {
      const tabs = buildDashboardTabs(ROLES.MANAGER);
      expect(tabs.map((tab) => tab.id)).toEqual(["consulta", "credito", "importacoes"]);
    });

    it("admin inclui todas as abas", () => {
      const tabs = buildDashboardTabs(ROLES.ADMIN);
      expect(tabs.map((tab) => tab.id)).toEqual([
        "consulta",
        "credito",
        "importacoes",
        "pap",
        "usuarios",
      ]);
    });
  });
});
