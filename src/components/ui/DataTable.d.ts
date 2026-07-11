import type { ReactNode } from "react";

export interface DataTableColumn {
  key: string;
  label: string;
}

export function DataTable(props: {
  columns: DataTableColumn[];
  caption?: string;
  isEmpty?: boolean;
  loading?: boolean;
  loadingComponent?: ReactNode;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  children?: ReactNode;
}): JSX.Element;

export function DataTableRow(props: { children: ReactNode }): JSX.Element;
export function DataTableCell(props: { children: ReactNode; className?: string }): JSX.Element;
