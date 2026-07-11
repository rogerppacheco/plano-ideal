export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  OPERATOR: "operator",
};

export const ROLE_LABELS = {
  admin: "Administrador",
  manager: "Gestor",
  operator: "Operador",
  vendedor: "Operador",
};

export function canManageUsers(role) {
  return role === ROLES.ADMIN;
}

export function canManagePap(role) {
  return role === ROLES.ADMIN;
}

export function canManageImports(role) {
  return role === ROLES.ADMIN || role === ROLES.MANAGER;
}

export function canViewAllCreditHistory(role) {
  return role === ROLES.ADMIN || role === ROLES.MANAGER;
}

export function buildDashboardTabs(role) {
  const tabs = [
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
  }

  return tabs;
}
