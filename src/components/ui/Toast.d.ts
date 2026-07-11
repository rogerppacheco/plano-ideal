import type { ReactNode } from "react";

export interface ToastApi {
  toast: (message: string, type?: string) => string;
  success: (message: string) => string;
  error: (message: string) => string;
  info: (message: string) => string;
  warning: (message: string) => string;
}

export function ToastProvider(props: { children: ReactNode }): JSX.Element;
export function useToast(): ToastApi;
