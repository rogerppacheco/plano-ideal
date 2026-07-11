export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  OPERATOR: "operator",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface InternalUser {
  id: number;
  username: string;
  fullName: string;
  full_name?: string;
  name?: string;
  role: Role;
  isActive: boolean;
  is_active?: boolean;
  lastLoginAt?: string | null;
  last_login_at?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface SessionPayload {
  user: InternalUser;
  token: string;
}

/** Visão normalizada para listagem e ações no painel admin */
export interface AdminUserView {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
}

export interface CreateUserForm {
  username: string;
  fullName: string;
  role: Role;
  password: string;
}

export type PendingUserAction =
  | { type: "status"; user: AdminUserView; nextActive: boolean }
  | { type: "delete"; user: AdminUserView };

export function toAdminUserView(user: InternalUser): AdminUserView {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name ?? user.fullName ?? user.name ?? user.username,
    role: user.role,
    isActive: user.is_active ?? user.isActive ?? true,
    lastLoginAt: user.last_login_at ?? user.lastLoginAt ?? null,
  };
}
