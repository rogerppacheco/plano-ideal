import type { ReactNode } from "react";

export interface FormFieldRenderProps {
  id: string;
  describedBy?: string;
  "aria-invalid"?: boolean;
}

export function FormField(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: FormFieldRenderProps) => ReactNode;
}): JSX.Element;
