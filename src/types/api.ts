import type { InternalUser } from "./auth";

export type ApiErrorCode =
  | "TOKEN_REVOKED"
  | "ACCOUNT_INACTIVE"
  | "INVALID_TOKEN"
  | "USER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "SERVER_MISCONFIGURED"
  | "LOGIN_FAILED"
  | "USERNAME_CONFLICT"
  | "CREDIT_HISTORY_BLOCKED"
  | (string & {});

export interface ApiErrorPayload {
  message?: string;
  code?: ApiErrorCode;
}

export interface ApiErrorOptions {
  status?: number;
  code?: ApiErrorCode;
  url?: string;
}

export interface LoginResponse {
  token: string;
  user: InternalUser;
}

export interface UsersListResponse {
  users: InternalUser[];
}

export interface UserMutationResponse {
  user: InternalUser;
  message?: string;
}

export interface DeleteUserResponse {
  deleted: boolean;
  userId: number;
  message?: string;
}
