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
