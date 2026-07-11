export function FormField({ id, label, hint, error, required = false, children, className = "" }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`form-field ${className}`}>
      {label ? (
        <label htmlFor={id} className="form-label">
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </label>
      ) : null}
      {children
        ? typeof children === "function"
          ? children({ id, describedBy, "aria-invalid": error ? "true" : undefined })
          : children
        : null}
      {hint && !error ? (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
