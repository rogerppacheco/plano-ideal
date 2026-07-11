import type { Role } from "../types/auth";

export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  OPERATOR: "operator",
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  operator: "Operador",
  vendedor: "Operador",
};

export interface DashboardTab {
  id: string;
  label: string;
  icon: string;
}

export function canManageUsers(role: Role | string | null | undefined): boolean {
  return role === ROLES.ADMIN;
}

export function canManageApiPartners(role: Role | string | null | undefined): boolean {
  return role === ROLES.ADMIN;
}

export function canManagePap(role: Role | string | null | undefined): boolean {
  return role === ROLES.ADMIN;
}

export function canManageImports(role: Role | string | null | undefined): boolean {
  return role === ROLES.ADMIN || role === ROLES.MANAGER;
}

export function canViewAllCreditHistory(role: Role | string | null | undefined): boolean {
  return role === ROLES.ADMIN || role === ROLES.MANAGER;
}

export function buildDashboardTabs(role: Role | string | null | undefined): DashboardTab[] {
  const tabs: DashboardTab[] = [
    { id: "consulta", label: "Consulta", icon: "📍" },
    { id: "credito", label: "Consulta Crédito", icon: "💳" },
  ];

  if (canManageImports(role)) {
    tabs.push({ id: "importacoes", label: "Importações", icon: "📥" });
  }
  if (canManagePap(role)) {
    tabs.push({ id: "pap", label: "PAP", icon: "⚙️" });
  }
  if (canManageUsers(role)) {
    tabs.push({ id: "usuarios", label: "Usuários", icon: "👥" });
    tabs.push({ id: "api-parceiros", label: "API / Parceiros", icon: "🔑" });
  }

  return tabs;
}
