import { EmptyState } from "./EmptyState";

export function DataTable({
  columns,
  children,
  emptyIcon = "table",
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription = "",
  emptyAction = null,
  isEmpty = false,
  loading = false,
  loadingComponent = null,
  caption,
  className = "",
}) {
  if (loading) {
    return loadingComponent;
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={`data-table-wrapper ${className}`}>
      <table className="data-table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key || col.label} scope="col" className={col.className || ""}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DataTableRow({ children, className = "" }) {
  return <tr className={`data-table-row ${className}`}>{children}</tr>;
}

export function DataTableCell({ children, className = "" }) {
  return <td className={className}>{children}</td>;
}
