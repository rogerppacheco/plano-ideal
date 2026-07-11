export const ROLES = Object.freeze({
  ADMIN: "admin",
  MANAGER: "manager",
  OPERATOR: "operator",
});

export const ROLE_LIST = Object.values(ROLES);

export function isValidRole(role) {
  return ROLE_LIST.includes(role);
}

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
