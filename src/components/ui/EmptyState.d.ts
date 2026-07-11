import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: "search" | "table" | "users" | "config" | string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
